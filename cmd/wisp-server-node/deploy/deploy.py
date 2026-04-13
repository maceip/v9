#!/usr/bin/env python3
"""
deploy.py — create geo-distributed Wisp nodes + DO Global Load Balancer.

Usage:
    DO_TOKEN=... python3 deploy.py [--dry-run] [--recreate]
                                    [--regions fra1,nyc3,sgp1,syd1]
                                    [--domain edge.stare.network]

Idempotent. Existing droplets are reused unless --recreate. Existing
load balancers are reused and their target list reconciled.

Topology:
  - 1 DO Cloud Firewall ("wisp-nodes-fw") — allows :8080 inbound only
    from DO load balancer source. Applied by tag.
  - N droplets (one per region), tagged "wisp-node".
  - 1 DO Global Load Balancer — HTTPS:443 -> HTTP:8080, CDN caching
    enabled, custom domain attached, targets by tag.

Prints the GLB's DNS name and IP at the end for the user to A/AAAA
(or CNAME) from their authoritative Knot nameserver.
"""
import argparse
import json
import os
import sys
import time
import urllib.request
import urllib.error

DO_API = "https://api.digitalocean.com/v2"

# (region, continent, label, droplet_name)
DEFAULT_REGIONS = [
    ("fra1", "Europe",        "fra", "wisp-fra"),
    ("nyc3", "North America", "nyc", "wisp-nyc"),
    ("sgp1", "Asia",          "sgp", "wisp-sgp"),
    ("syd1", "Oceania",       "syd", "wisp-syd"),
]
DEFAULT_DOMAIN = "edge.stare.network"
IMAGE_SLUG = "ubuntu-24-04-x64"
SIZE_SLUG = "s-1vcpu-1gb"
TAG = "wisp-node"
FIREWALL_NAME = "wisp-nodes-fw"
LB_NAME = "wisp-glb"


# ─── HTTP helpers ──────────────────────────────────────────────────────
def api(method, path, token, body=None, ok_codes=(200, 201, 202, 204)):
    url = f"{DO_API}{path}"
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            raw = r.read()
            if r.status not in ok_codes:
                raise RuntimeError(f"{method} {path} -> HTTP {r.status}: {raw[:500]!r}")
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        body_text = e.read().decode("utf-8", "replace")
        raise RuntimeError(f"{method} {path} -> HTTP {e.code}: {body_text}") from None


# ─── Droplet ops ───────────────────────────────────────────────────────
def find_droplet(token, name):
    page = 1
    while True:
        r = api("GET", f"/droplets?page={page}&per_page=200", token)
        for d in r.get("droplets", []):
            if d["name"] == name:
                return d
        if not r.get("links", {}).get("pages", {}).get("next"):
            return None
        page += 1


def create_droplet(token, name, region, user_data):
    body = {
        "name": name,
        "region": region,
        "size": SIZE_SLUG,
        "image": IMAGE_SLUG,
        "ssh_keys": [],            # zero keys — unreachable by design
        "backups": False,
        "ipv6": True,
        "monitoring": True,
        "user_data": user_data,
        "tags": [TAG],
    }
    r = api("POST", "/droplets", token, body)
    return r["droplet"]["id"]


def wait_active(token, droplet_id, timeout=420):
    deadline = time.time() + timeout
    while time.time() < deadline:
        d = api("GET", f"/droplets/{droplet_id}", token)["droplet"]
        if d["status"] == "active":
            return d
        time.sleep(5)
    raise TimeoutError(f"droplet {droplet_id} never became active within {timeout}s")


def public_v4(droplet):
    for n in droplet.get("networks", {}).get("v4", []):
        if n.get("type") == "public":
            return n["ip_address"]
    return None


def public_v6(droplet):
    for n in droplet.get("networks", {}).get("v6", []):
        if n.get("type") == "public":
            return n["ip_address"]
    return None


# ─── Firewall ──────────────────────────────────────────────────────────
def ensure_firewall(token):
    r = api("GET", "/firewalls?per_page=200", token)
    existing = next((f for f in r.get("firewalls", []) if f["name"] == FIREWALL_NAME), None)
    body = {
        "name": FIREWALL_NAME,
        "inbound_rules": [
            {
                "protocol": "tcp",
                "ports": "8080",
                "sources": {"load_balancer_uids": []},  # will resolve once LB exists
            },
        ],
        "outbound_rules": [
            {"protocol": "tcp",  "ports": "all",
             "destinations": {"addresses": ["0.0.0.0/0", "::/0"]}},
            {"protocol": "udp",  "ports": "all",
             "destinations": {"addresses": ["0.0.0.0/0", "::/0"]}},
            {"protocol": "icmp",
             "destinations": {"addresses": ["0.0.0.0/0", "::/0"]}},
        ],
        "tags": [TAG],
    }
    if existing:
        print(f"  firewall {FIREWALL_NAME!r} exists (id={existing['id']}), updating rules")
        api("PUT", f"/firewalls/{existing['id']}", token, body)
        return existing["id"]
    r = api("POST", "/firewalls", token, body)
    print(f"  firewall {FIREWALL_NAME!r} created: {r['firewall']['id']}")
    return r["firewall"]["id"]


def firewall_set_lb_source(token, fw_id, lb_id):
    """Replace the :8080 rule's source with the newly-created LB's UID so
    the firewall only accepts traffic from our specific LB."""
    body = {
        "inbound_rules": [
            {
                "protocol": "tcp",
                "ports": "8080",
                "sources": {"load_balancer_uids": [lb_id]},
            },
        ],
        "outbound_rules": [
            {"protocol": "tcp",  "ports": "all",
             "destinations": {"addresses": ["0.0.0.0/0", "::/0"]}},
            {"protocol": "udp",  "ports": "all",
             "destinations": {"addresses": ["0.0.0.0/0", "::/0"]}},
            {"protocol": "icmp",
             "destinations": {"addresses": ["0.0.0.0/0", "::/0"]}},
        ],
    }
    api("PUT", f"/firewalls/{fw_id}/rules", token, {
        "inbound_rules": body["inbound_rules"],
    })


# ─── Global Load Balancer ──────────────────────────────────────────────
def find_lb(token, name):
    r = api("GET", "/load_balancers?per_page=200", token)
    return next((lb for lb in r.get("load_balancers", []) if lb["name"] == name), None)


def ensure_glb(token, domain):
    existing = find_lb(token, LB_NAME)
    body = {
        "name": LB_NAME,
        "type": "GLOBAL",
        "tag": TAG,                       # auto-enrol any droplet with tag
        "forwarding_rules": [
            {
                "entry_protocol": "http",
                "entry_port": 80,
                "target_protocol": "http",
                "target_port": 8080,
            },
            {
                "entry_protocol": "https",
                "entry_port": 443,
                "target_protocol": "http",
                "target_port": 8080,
                "tls_passthrough": False,  # terminate TLS at the LB
            },
        ],
        "health_check": {
            "protocol": "http",
            "port": 8080,
            "path": "/health",
            "check_interval_seconds": 10,
            "response_timeout_seconds": 5,
            "healthy_threshold": 2,
            "unhealthy_threshold": 3,
        },
        "glb_settings": {
            "target_protocol": "http",
            "target_port": 8080,
            "cdn": {"is_enabled": True},
        },
        "domains": [
            {
                "name": domain,
                "is_managed": False,       # user will point DNS manually
            },
        ],
        "redirect_http_to_https": False,
        "enable_proxy_protocol": False,
        "enable_backend_keepalive": True,
        "disable_lets_encrypt_dns_records": True,
    }
    if existing:
        print(f"  load balancer {LB_NAME!r} exists (id={existing['id']}), updating")
        api("PUT", f"/load_balancers/{existing['id']}", token, body)
        return existing["id"]
    print(f"  creating Global LB with CDN + domain={domain}")
    r = api("POST", "/load_balancers", token, body)
    return r["load_balancer"]["id"]


def wait_lb_active(token, lb_id, timeout=600):
    deadline = time.time() + timeout
    last = None
    while time.time() < deadline:
        lb = api("GET", f"/load_balancers/{lb_id}", token)["load_balancer"]
        if lb["status"] != last:
            print(f"    LB status: {lb['status']}")
            last = lb["status"]
        if lb["status"] == "active":
            return lb
        if lb["status"] == "errored":
            raise RuntimeError(f"LB entered errored state: {lb}")
        time.sleep(10)
    raise TimeoutError(f"LB {lb_id} did not become active within {timeout}s")


def render_cloud_init(template_path, fqdn):
    with open(template_path, "r") as f:
        tpl = f.read()
    return tpl.replace("__FQDN__", fqdn)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--recreate", action="store_true",
                   help="destroy any existing droplet with the same name first")
    p.add_argument("--regions", default=",".join(r[0] for r in DEFAULT_REGIONS))
    p.add_argument("--domain", default=DEFAULT_DOMAIN)
    p.add_argument("--skip-lb", action="store_true",
                   help="only create droplets, don't touch the load balancer")
    args = p.parse_args()

    token = os.environ.get("DO_TOKEN")
    if not token:
        sys.exit("DO_TOKEN env var required")

    script_dir = os.path.dirname(os.path.abspath(__file__))
    template = os.path.join(script_dir, "cloud-init.sh")
    if not os.path.exists(template):
        sys.exit(f"cloud-init template not found at {template}")

    active = [r for r in DEFAULT_REGIONS if r[0] in args.regions.split(",")]
    if not active:
        sys.exit("no regions selected")

    print("── DigitalOcean Wisp deploy ──")
    print(f"  domain:  {args.domain}")
    print(f"  regions: {','.join(r[0] for r in active)}")
    print(f"  size:    {SIZE_SLUG}")
    print(f"  image:   {IMAGE_SLUG}")

    if args.dry_run:
        print("\n[dry-run] not touching DO")
        for region, continent, label, name in active:
            print(f"  would create: {name} in {region} ({continent})")
        print(f"  would create: Global LB {LB_NAME!r} with domain {args.domain}")
        return

    # ── [1/5] firewall (initially open to any LB — we'll lock it to ours later)
    print("\n[1/5] firewall")
    fw_id = ensure_firewall(token)

    # ── [2/5] droplets
    print("\n[2/5] creating droplets")
    user_data = render_cloud_init(template, args.domain)
    created = []
    for region, continent, label, name in active:
        existing = find_droplet(token, name)
        if existing and not args.recreate:
            print(f"  {name} ({region}): exists id={existing['id']}, reusing")
            created.append((name, region, continent, existing["id"]))
            continue
        if existing and args.recreate:
            print(f"  {name} ({region}): destroying old id={existing['id']}")
            api("DELETE", f"/droplets/{existing['id']}", token)
            time.sleep(5)
        did = create_droplet(token, name, region, user_data)
        print(f"  {name} ({region}): created id={did}")
        created.append((name, region, continent, did))

    # ── [3/5] wait for droplets active
    print("\n[3/5] waiting for droplets to become active")
    results = []
    for name, region, continent, did in created:
        try:
            d = wait_active(token, did, timeout=420)
            v4 = public_v4(d)
            v6 = public_v6(d)
            print(f"  {name}: active v4={v4} v6={v6}")
            results.append((name, region, continent, did, v4, v6))
        except Exception as e:
            print(f"  {name}: FAILED — {e}")
            results.append((name, region, continent, did, None, None))

    # ── [4/5] load balancer
    if args.skip_lb:
        print("\n[4/5] --skip-lb: not touching load balancer")
        lb_id = None
    else:
        print("\n[4/5] creating Global Load Balancer")
        lb_id = ensure_glb(token, args.domain)
        print("  waiting for LB to become active (up to 10 min)")
        try:
            lb = wait_lb_active(token, lb_id)
            print(f"  LB active: ip={lb.get('ip')}")
            # Lock the firewall to only this LB as source
            print("  locking firewall inbound :8080 to this LB's UID")
            firewall_set_lb_source(token, fw_id, lb_id)
        except Exception as e:
            print(f"  LB: FAILED — {e}")
            lb = None

    # ── [5/5] report
    print("\n[5/5] topology")
    print("\nDroplets:")
    print(f"  {'NAME':12s} {'REGION':6s} {'v4':18s} {'v6'}")
    print(f"  {'-'*12} {'-'*6} {'-'*18} {'-'*40}")
    for name, region, continent, did, v4, v6 in results:
        print(f"  {name:12s} {region:6s} {v4 or '?':18s} {v6 or '?'}")

    if not args.skip_lb and lb_id:
        lb = api("GET", f"/load_balancers/{lb_id}", token)["load_balancer"]
        print()
        print("Global Load Balancer:")
        print(f"  id:             {lb['id']}")
        print(f"  name:           {lb['name']}")
        print(f"  status:         {lb['status']}")
        print(f"  public IPv4:    {lb.get('ip', '(pending)')}")
        print(f"  public IPv6:    {lb.get('ipv6', '(pending)')}")
        print(f"  domain:         {args.domain}")
        print(f"  cdn caching:    enabled")
        print(f"  backends:       by tag '{TAG}' ({len(results)} droplets)")
        print()
        print("DNS to set on your authoritative Knot nameserver:")
        print()
        print(f"  {args.domain}.  300  IN  A     {lb.get('ip', '<pending>')}")
        if lb.get("ipv6"):
            print(f"  {args.domain}.  300  IN  AAAA  {lb['ipv6']}")
        print()
        print("Once the A/AAAA records resolve, DO's Let's Encrypt integration will")
        print("issue a cert for the custom domain within ~60s. Until then, wss://")
        print(f"{args.domain}/wisp/ returns a cert error but the LB is healthy.")


if __name__ == "__main__":
    main()
