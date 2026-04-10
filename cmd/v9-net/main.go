package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"sync"
	"syscall"

	gvntypes "github.com/containers/gvisor-tap-vsock/pkg/types"
	gvnvirtualnetwork "github.com/containers/gvisor-tap-vsock/pkg/virtualnetwork"
	"golang.org/x/net/websocket"
)

const (
	gatewayIP = "192.168.127.1"
	vmIP      = "192.168.127.3"
	vmMAC     = "02:00:00:00:00:01"
)

var usage = `v9-net — local network proxy for v9 browser runtime

Provides TCP networking (connect + listen) to Node.js code running in
the browser via a userspace virtual network (gvisor-tap-vsock).

QUICK START

  Just run it:

    $ v9-net

  That's it. Open https://maceip.github.io/v9/ in your browser.
  Ports are forwarded automatically when the browser app calls listen().

EXAMPLES

  1. Simplest — run the proxy, open v9 in browser:

    $ v9-net
    # Then open https://maceip.github.io/v9/

  2. Run the proxy alongside a local v9 app:

    $ v9-net &
    $ v9 run my-server.js
    # my-server.js can do http.createServer().listen(3000)
    # and it's reachable at localhost:3000 from your machine

  3. Clone v9 from scratch and test:

    $ git clone https://github.com/maceip/v9.git && cd v9
    $ npm install
    $ ./cmd/v9-net/v9-net &          # start the network proxy
    $ npx v9 run examples/hello.js   # run a Node.js app in-browser

  4. Pre-forward specific ports (optional — dynamic forwarding is automatic):

    $ v9-net -p 4000 -p 5173 -p 8081

  5. Custom WebSocket port:

    $ v9-net -listen :9999

  6. With debug logging (shows ARP, TCP handshakes, port forwards):

    $ v9-net -debug

HOW IT WORKS

  Browser (v9 runtime)  ←— WebSocket —→  v9-net  ←— real TCP —→  internet
                                            ↕
                                     dynamic port forwarding
                                     browser listen(19836) → host :19836 opens

  Your browser sets NODEJS_GVISOR_WS_URL=ws://localhost:8765 and all
  net.connect(), http.createServer().listen(), tls.connect() calls
  route through this proxy. No CORS issues, no forbidden headers.

  When the browser calls server.listen(port), v9-net automatically
  opens that port on your machine and forwards traffic into the
  virtual network. No need to pre-declare ports.

OPTIONS
`

// ── Dynamic port forwarder ──────────────────────────────────────

type portForwarder struct {
	mu        sync.Mutex
	listeners map[int]net.Listener
	vn        *gvnvirtualnetwork.VirtualNetwork
}

func newPortForwarder(vn *gvnvirtualnetwork.VirtualNetwork) *portForwarder {
	return &portForwarder{
		listeners: make(map[int]net.Listener),
		vn:        vn,
	}
}

func (pf *portForwarder) Forward(port int) error {
	pf.mu.Lock()
	defer pf.mu.Unlock()

	if _, exists := pf.listeners[port]; exists {
		return nil // already forwarding
	}

	addr := fmt.Sprintf("0.0.0.0:%d", port)
	ln, err := net.Listen("tcp", addr)
	if err != nil {
		return fmt.Errorf("cannot listen on %s: %w", addr, err)
	}

	pf.listeners[port] = ln
	fmt.Fprintf(os.Stderr, "  + forwarding port %d\n", port)

	go func() {
		for {
			conn, err := ln.Accept()
			if err != nil {
				return // listener closed
			}
			go pf.proxy(conn, port)
		}
	}()

	return nil
}

func (pf *portForwarder) proxy(hostConn net.Conn, port int) {
	defer hostConn.Close()

	vmAddr := fmt.Sprintf("%s:%d", vmIP, port)
	vmConn, err := pf.vn.Dial("tcp", vmAddr)
	if err != nil {
		log.Printf("forward %d: dial VM failed: %v", port, err)
		return
	}
	defer vmConn.Close()

	done := make(chan struct{}, 2)
	go func() { io.Copy(vmConn, hostConn); done <- struct{}{} }()
	go func() { io.Copy(hostConn, vmConn); done <- struct{}{} }()
	<-done
	<-done // wait for both directions
}

func (pf *portForwarder) Close(port int) {
	pf.mu.Lock()
	defer pf.mu.Unlock()
	if ln, ok := pf.listeners[port]; ok {
		ln.Close()
		delete(pf.listeners, port)
		fmt.Fprintf(os.Stderr, "  - stopped forwarding port %d\n", port)
	}
}

func (pf *portForwarder) CloseAll() {
	pf.mu.Lock()
	defer pf.mu.Unlock()
	for port, ln := range pf.listeners {
		ln.Close()
		delete(pf.listeners, port)
		log.Printf("closed port %d", port)
	}
}

// ── Main ────────────────────────────────────────────────────────

func main() {
	flag.Usage = func() {
		fmt.Fprint(os.Stderr, usage)
		flag.PrintDefaults()
	}

	var portFlags sliceFlags
	flag.Var(&portFlags, "p", "pre-forward a port (e.g. -p 3000). Dynamic forwarding is always on.")
	var (
		listenAddr = flag.String("listen", ":8765", "WebSocket listen address")
		debug      = flag.Bool("debug", false, "enable verbose logging")
		enableTLS  = flag.Bool("tls", false, "enable TLS on the WebSocket")
		certFile   = flag.String("cert", "", "TLS certificate file (requires -tls)")
		keyFile    = flag.String("key", "", "TLS key file (requires -tls)")
	)
	flag.Parse()

	if args := flag.Args(); len(args) > 0 {
		fmt.Fprintf(os.Stderr, "error: unexpected argument %q\n", args[0])
		fmt.Fprintf(os.Stderr, "  Did you mean: v9-net -p %s\n", args[0])
		fmt.Fprintf(os.Stderr, "  Or:           v9-net -listen :%s\n", args[0])
		os.Exit(1)
	}

	if *debug {
		log.SetOutput(os.Stderr)
	} else {
		log.SetOutput(io.Discard)
	}

	// Static forwards from -p flags (gvisor config level)
	forwards := make(map[string]string)
	for _, p := range portFlags {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		parts := strings.Split(p, ":")
		switch len(parts) {
		case 3:
			forwards[strings.Join(parts[0:2], ":")] = vmIP + ":" + parts[2]
		case 2:
			forwards["0.0.0.0:"+parts[0]] = vmIP + ":" + parts[1]
		case 1:
			forwards["0.0.0.0:"+parts[0]] = vmIP + ":" + parts[0]
		default:
			fmt.Fprintf(os.Stderr, "warning: ignoring invalid port mapping: %s\n", p)
		}
	}

	config := &gvntypes.Configuration{
		Debug:             *debug,
		MTU:               1500,
		Subnet:            "192.168.127.0/24",
		GatewayIP:         gatewayIP,
		GatewayMacAddress: "5a:94:ef:e4:0c:dd",
		DHCPStaticLeases: map[string]string{
			vmIP: vmMAC,
		},
		Forwards: forwards,
		NAT: map[string]string{
			"192.168.127.254": "127.0.0.1",
		},
		GatewayVirtualIPs: []string{"192.168.127.254"},
		Protocol:          gvntypes.QemuProtocol,
	}

	vn, err := gvnvirtualnetwork.New(config)
	if err != nil {
		fmt.Fprintf(os.Stderr, "error: failed to create virtual network: %v\n", err)
		os.Exit(1)
	}

	pf := newPortForwarder(vn)
	defer pf.CloseAll()

	mux := http.NewServeMux()

	// QEMU virtual network endpoint
	mux.Handle("/", websocket.Handler(func(ws *websocket.Conn) {
		defer func() {
			if r := recover(); r != nil {
				fmt.Fprintf(os.Stderr, "  warning: session recovered from panic: %v\n", r)
			}
		}()
		ws.PayloadType = websocket.BinaryFrame
		if err := vn.AcceptQemu(context.Background(), ws); err != nil {
			log.Printf("session ended: %v\n", err)
		}
	}))

	// Dynamic port forward control endpoint
	mux.Handle("/__v9net/forward", websocket.Handler(func(ws *websocket.Conn) {
		defer ws.Close()
		dec := json.NewDecoder(ws)
		enc := json.NewEncoder(ws)
		for {
			var msg struct {
				Action string `json:"action"`
				Port   int    `json:"port"`
			}
			if err := dec.Decode(&msg); err != nil {
				return
			}
			switch msg.Action {
			case "forward":
				if msg.Port < 1 || msg.Port > 65535 {
					enc.Encode(map[string]interface{}{"ok": false, "error": "invalid port"})
					continue
				}
				if err := pf.Forward(msg.Port); err != nil {
					log.Printf("forward port %d failed: %v", msg.Port, err)
					enc.Encode(map[string]interface{}{"ok": false, "error": err.Error()})
				} else {
					enc.Encode(map[string]interface{}{"ok": true, "port": msg.Port})
				}
			case "unforward":
				pf.Close(msg.Port)
				enc.Encode(map[string]interface{}{"ok": true, "port": msg.Port})
			default:
				enc.Encode(map[string]interface{}{"ok": false, "error": "unknown action"})
			}
		}
	}))

	listener, err := net.Listen("tcp", *listenAddr)
	if err != nil {
		fmt.Fprintf(os.Stderr, "error: cannot listen on %s: %v\n", *listenAddr, err)
		os.Exit(1)
	}

	fmt.Fprintf(os.Stderr, "\n  v9-net running\n\n")
	fmt.Fprintf(os.Stderr, "  WebSocket:  ws://localhost%s\n", *listenAddr)
	if len(portFlags) > 0 {
		fmt.Fprintf(os.Stderr, "  Pre-forwarded: %s\n", strings.Join(portFlags, ", "))
	}
	fmt.Fprintf(os.Stderr, "  Dynamic forwarding: enabled (ports open on demand)\n")
	fmt.Fprintf(os.Stderr, "  Open:       https://maceip.github.io/v9/\n")
	fmt.Fprintf(os.Stderr, "\n  Press Ctrl+C to stop.\n\n")

	server := &http.Server{Handler: mux}

	go func() {
		sig := make(chan os.Signal, 1)
		signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
		<-sig
		fmt.Fprintf(os.Stderr, "\n  Shutting down...\n")
		pf.CloseAll()
		server.Close()
	}()

	if *enableTLS {
		if *certFile == "" || *keyFile == "" {
			fmt.Fprintf(os.Stderr, "error: -tls requires -cert and -key\n")
			os.Exit(1)
		}
		if err := server.ServeTLS(listener, *certFile, *keyFile); err != nil && err != http.ErrServerClosed {
			fmt.Fprintf(os.Stderr, "error: %v\n", err)
			os.Exit(1)
		}
	} else {
		if err := server.Serve(listener); err != nil && err != http.ErrServerClosed {
			fmt.Fprintf(os.Stderr, "error: %v\n", err)
			os.Exit(1)
		}
	}
}

type sliceFlags []string

func (f *sliceFlags) String() string {
	return fmt.Sprintf("%v", []string(*f))
}

func (f *sliceFlags) Set(value string) error {
	*f = append(*f, value)
	return nil
}
