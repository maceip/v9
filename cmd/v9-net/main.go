package main

import (
	"context"
	"flag"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strings"
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
  Ports 3000 and 8080 are forwarded by default.

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

  4. Forward custom ports:

    $ v9-net -p 4000 -p 5173 -p 8081

  5. Custom WebSocket port:

    $ v9-net -listen :9999

  6. With debug logging (shows ARP, TCP handshakes):

    $ v9-net -debug

HOW IT WORKS

  Browser (v9 runtime)  ←— WebSocket —→  v9-net  ←— real TCP —→  internet
                                            ↕
                                     port forwarding
                                     localhost:3000 → browser app

  Your browser sets NODEJS_GVISOR_WS_URL=ws://localhost:8765 and all
  net.connect(), http.createServer().listen(), tls.connect() calls
  route through this proxy. No CORS issues, no forbidden headers.

OPTIONS
`

func main() {
	// Override default flag.Usage (v2)
	flag.Usage = func() {
		fmt.Fprint(os.Stderr, usage)
		flag.PrintDefaults()
	}

	var portFlags sliceFlags
	flag.Var(&portFlags, "p", "forward a port between host and browser (e.g. -p 3000)")
	var (
		listenAddr = flag.String("listen", ":8765", "WebSocket listen address")
		debug      = flag.Bool("debug", false, "enable verbose logging")
		enableTLS  = flag.Bool("tls", false, "enable TLS on the WebSocket")
		certFile   = flag.String("cert", "", "TLS certificate file (requires -tls)")
		keyFile    = flag.String("key", "", "TLS key file (requires -tls)")
	)
	flag.Parse()

	// Default port forwards if none specified (or all empty)
	hasReal := false
	for _, p := range portFlags {
		if strings.TrimSpace(p) != "" {
			hasReal = true
			break
		}
	}
	if !hasReal {
		portFlags = sliceFlags{"3000", "8080"}
	}

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

	// Reject unknown positional args (common mistake: passing a port without -p)
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

	mux := http.NewServeMux()
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

	listener, err := net.Listen("tcp", *listenAddr)
	if err != nil {
		fmt.Fprintf(os.Stderr, "error: cannot listen on %s: %v\n", *listenAddr, err)
		os.Exit(1)
	}

	// Print startup banner
	fmt.Fprintf(os.Stderr, "\n  v9-net running\n\n")
	fmt.Fprintf(os.Stderr, "  WebSocket:  ws://localhost%s\n", *listenAddr)
	fmt.Fprintf(os.Stderr, "  Ports:      %s\n", strings.Join(portFlags, ", "))
	fmt.Fprintf(os.Stderr, "  Open:       https://maceip.github.io/v9/\n")
	fmt.Fprintf(os.Stderr, "\n  Press Ctrl+C to stop.\n\n")

	server := &http.Server{Handler: mux}

	// Graceful shutdown on Ctrl+C
	go func() {
		sig := make(chan os.Signal, 1)
		signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
		<-sig
		fmt.Fprintf(os.Stderr, "\n  Shutting down...\n")
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
