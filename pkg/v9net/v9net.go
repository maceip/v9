// Package v9net provides a gvisor-tap-vsock virtual network with WebSocket transport.
// Designed for gomobile bind — exported functions are Android/iOS callable.
package v9net

import (
	"context"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"strings"
	"sync"

	gvntypes "github.com/containers/gvisor-tap-vsock/pkg/types"
	gvnvirtualnetwork "github.com/containers/gvisor-tap-vsock/pkg/virtualnetwork"
	"golang.org/x/net/websocket"
)

const (
	GatewayIP = "192.168.127.1"
	VMIP      = "192.168.127.3"
	VMMAC     = "02:00:00:00:00:01"
)

var (
	mu      sync.Mutex
	running bool
	server  *http.Server
	cancel  context.CancelFunc
)

// Start launches the virtual network with WebSocket listener.
// portMappings is comma-separated "host:guest" pairs (e.g. "3000:3000,8080:8080").
// wsAddr is the WebSocket listen address (e.g. ":8765").
// debug enables verbose logging.
func Start(wsAddr string, portMappings string, debug bool) error {
	mu.Lock()
	defer mu.Unlock()
	if running {
		return fmt.Errorf("v9net: already running")
	}

	if debug {
		log.SetOutput(log.Default().Writer())
	} else {
		log.SetOutput(io.Discard)
	}

	forwards := make(map[string]string)
	if portMappings != "" {
		for _, mapping := range strings.Split(portMappings, ",") {
			mapping = strings.TrimSpace(mapping)
			if mapping == "" {
				continue
			}
			parts := strings.Split(mapping, ":")
			switch len(parts) {
			case 3:
				forwards[strings.Join(parts[0:2], ":")] = VMIP + ":" + parts[2]
			case 2:
				forwards["0.0.0.0:"+parts[0]] = VMIP + ":" + parts[1]
			}
		}
	}

	log.Printf("v9net: port mapping: %+v\n", forwards)

	config := &gvntypes.Configuration{
		Debug:             debug,
		MTU:               1500,
		Subnet:            "192.168.127.0/24",
		GatewayIP:         GatewayIP,
		GatewayMacAddress: "5a:94:ef:e4:0c:dd",
		DHCPStaticLeases: map[string]string{
			VMIP: VMMAC,
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
		return fmt.Errorf("v9net: virtual network init failed: %w", err)
	}

	mux := http.NewServeMux()
	mux.Handle("/", websocket.Handler(func(ws *websocket.Conn) {
		ws.PayloadType = websocket.BinaryFrame
		if err := vn.AcceptQemu(context.Background(), ws); err != nil {
			log.Printf("v9net: forwarding finished: %v\n", err)
		}
	}))

	ctx, c := context.WithCancel(context.Background())
	cancel = c

	listener, err := net.Listen("tcp", wsAddr)
	if err != nil {
		cancel()
		return fmt.Errorf("v9net: listen %s failed: %w", wsAddr, err)
	}

	server = &http.Server{Handler: mux}
	running = true

	go func() {
		log.Printf("v9net: listening on %s\n", wsAddr)
		if err := server.Serve(listener); err != nil && err != http.ErrServerClosed {
			log.Printf("v9net: serve error: %v\n", err)
		}
	}()

	go func() {
		<-ctx.Done()
		server.Close()
	}()

	return nil
}

// Stop shuts down the virtual network and WebSocket listener.
func Stop() {
	mu.Lock()
	defer mu.Unlock()
	if !running {
		return
	}
	if cancel != nil {
		cancel()
	}
	running = false
	log.Println("v9net: stopped")
}

// IsRunning returns whether the network is currently active.
func IsRunning() bool {
	mu.Lock()
	defer mu.Unlock()
	return running
}
