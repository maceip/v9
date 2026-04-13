#!/usr/bin/env python3
"""
deploy.py — create geo-distributed Wisp nodes on DigitalOcean.

Usage:
    DO_TOKEN=... python3 deploy.py [--dry-run] [--regions fra1,nyc3,sgp1,syd1]

Idempotent. If a droplet with the expected name already exists, it's left
alone (use --recreate to replace). Prints a final topology table for the
DNS operator to set A records manually.

No SSH access is ever used. All verification is over the droplet's
public IP once cloud-init completes.
"""
import argparse
import json
import os
import sys
import time
import urllib.request
import urllib.error

DO_API = "https://api.digitalocean.com/v2"
DEFAULT_REGIONS = [
    # (region, continent, fqdn_label, droplet_name)
    ("fra1", "Europe",        "fra", "wisp-fra"),
    ("nyc3", "North America", "nyc", "wisp-nyc"),
    ("sgp1", "Asia",          "sgp", "wisp-sgp"),
    ("syd1", "Oceania",       "syd", "wisp-syd"),
]
DOMAIN = "edge.stare.network"
IMAGE_SLUG = "ubuntu-24-04-x64"
SIZE_SLUG = "s-1vcpu-1gb"
TAG = "wisp-node"


def api(method, path, token, body=None):
    url = f"{DO_API}{path}"
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            raw = r.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        body_text = e.read().decode("utf-8", "replace")
        raise RuntimeError(f"{method} {path} -> HTTP {e.code}: {body_text}") from None


def find_droplet(token, name):
    page = 1
    while True:
        r = api("GET", f"/droplets?page={page}&per_page=200", token)
        for d in r.get("droplets", []):
            if d["name"] == name:
                return d
        links = r.get("links", {}).get("pages", {})
        if not links.get("next"):
            return None
        page += 1


def ensure_firewall(token):
    """Create (or update) a firewall that allows 80 + 443 inbound from world,
    denies everything else inbound, allows all outbound. Applied by tag."""
    name = "wisp-nodes-fw"
    existing = None
    r = api("GET", "/firewalls?per_page=200", token)
    for fw in r.get("firewalls", []):
        if fw["name"] == name:
            existing = fw
            break

    desired = {
        "name": name,
        "inbound_rules": [
            {"protocol": "tcp", "ports": "80",  "sources": {"addresses": ["0.0.0.0/0", "::/0"]}},
            {"protocol": "tcp", "ports": "443", "sources": {"addresses": ["0.0.0.0/0", "::/0"]}},
        ],
        "outbound_rules": [
            {"protocol": "tcp", "ports": "all", "destinations": {"addresses": ["0.0.0.0/0", "::/0"]}},
            {"protocol": "udp", "ports": "all", "destinations": {"addresses": ["0.0.0.0/0", "::/0"]}},
            {"protocol": "icmp",                 "destinations": {"addresses": ["0.0.0.0/0", "::/0"]}},
        ],
        "tags": [TAG],
    }
    if existing:
        print(f"  firewall '{name}' exists (id={existing['id']})")
        return existing["id"]
    r = api("POST", "/firewalls", token, desired)
    fw_id = r["firewall"]["id"]
    print(f"  firewall created: {fw_id}")
    return fw_id


def render_cloud_init(template_path, fqdn):
    with open(template_path, "r") as f:
        tpl = f.read()
    return tpl.replace("__FQDN__", fqdn)


def create_droplet(token, name, region, user_data):
    body = {
        "name": name,
        "region": region,
        "size": SIZE_SLUG,
        "image": IMAGE_SLUG,
        "ssh_keys": [],           # zero SSH keys attached
        "backups": False,
        "ipv6": True,
        "monitoring": True,
        "user_data": user_data,
        "tags": [TAG],
    }
    r = api("POST", "/droplets", token, body)
    return r["droplet"]["id"]


def wait_active(token, droplet_id, timeout=300):
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


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--recreate", action="store_true",
                   help="destroy any existing droplet with the same name first")
    p.add_argument("--regions", default=",".join(r[0] for r in DEFAULT_REGIONS))
    p.add_argument("--domain", default=DOMAIN)
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
            fqdn = f"{label}.{args.domain}"
            print(f"  would create: {name} in {region} ({continent}) -> {fqdn}")
        return

    print("\n[1/4] firewall")
    ensure_firewall(token)

    print("\n[2/4] creating droplets")
    created = []
    for region, continent, label, name in active:
        fqdn = f"{label}.{args.domain}"
        existing = find_droplet(token, name)
        if existing and not args.recreate:
            print(f"  {name} ({region}): exists id={existing['id']}, reusing")
            created.append((name, region, continent, fqdn, existing["id"]))
            continue
        if existing and args.recreate:
            print(f"  {name} ({region}): destroying old id={existing['id']}")
            api("DELETE", f"/droplets/{existing['id']}", token)
            time.sleep(5)
        user_data = render_cloud_init(template, fqdn)
        did = create_droplet(token, name, region, user_data)
        print(f"  {name} ({region}): created id={did} -> {fqdn}")
        created.append((name, region, continent, fqdn, did))

    print("\n[3/4] waiting for droplets to become active")
    results = []
    for name, region, continent, fqdn, did in created:
        try:
            d = wait_active(token, did, timeout=300)
            v4 = public_v4(d)
            v6 = public_v6(d)
            print(f"  {name}: active v4={v4} v6={v6}")
            results.append((name, region, continent, fqdn, v4, v6))
        except Exception as e:
            print(f"  {name}: FAILED — {e}")
            results.append((name, region, continent, fqdn, None, None))

    print("\n[4/4] topology")
    print("\nSet these A/AAAA records on your authoritative nameserver:")
    print()
    print(f"  {'FQDN':32s} {'TYPE':6s} {'VALUE'}")
    print(f"  {'-'*32} {'-'*6} {'-'*40}")
    for name, region, continent, fqdn, v4, v6 in results:
        if v4:
            print(f"  {fqdn:32s} {'A':6s} {v4}")
        if v6:
            print(f"  {fqdn:32s} {'AAAA':6s} {v6}")
    print()
    print("Caddy on each droplet will obtain a Let's Encrypt cert for its FQDN")
    print("automatically, within ~60s of DNS propagation. Until then, https://")
    print("will fail with a cert error but the droplet is fine.")
    print()
    print("Verify each node once DNS is live:")
    for name, region, continent, fqdn, v4, v6 in results:
        if v4:
            print(f"  curl https://{fqdn}/health")


if __name__ == "__main__":
    main()
