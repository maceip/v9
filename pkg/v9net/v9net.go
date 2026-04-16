// Package v9net provides a gvisor-tap-vsock virtual network with WebSocket transport.
// Designed for gomobile bind — exported functions are Android/iOS callable.
package v9net

import (
	"context"
	"encoding/json"
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

	servicesMux := vn.ServicesMux()

	mux := http.NewServeMux()
	mux.Handle("/", websocket.Handler(func(ws *websocket.Conn) {
		ws.PayloadType = websocket.BinaryFrame
		if err := vn.AcceptQemu(context.Background(), ws); err != nil {
			log.Printf("v9net: forwarding finished: %v\n", err)
		}
	}))

	mux.Handle("/__v9net/forward", websocket.Handler(func(ws *websocket.Conn) {
		log.Printf("v9net: control connection from %s\n", ws.Request().RemoteAddr)
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
				local := fmt.Sprintf("0.0.0.0:%d", msg.Port)
				remote := fmt.Sprintf("%s:%d", VMIP, msg.Port)
				body := strings.NewReader(fmt.Sprintf(`{"local":"%s","remote":"%s","protocol":"tcp"}`, local, remote))
				req, _ := http.NewRequest("POST", "/services/forwarder/expose", body)
				req.Header.Set("Content-Type", "application/json")
				rec := &responseRecorder{code: 200}
				servicesMux.ServeHTTP(rec, req)
				if rec.code == 200 {
					log.Printf("v9net: + forwarding port %d\n", msg.Port)
					enc.Encode(map[string]interface{}{"ok": true, "port": msg.Port})
				} else {
					errMsg := rec.body.String()
					if strings.Contains(errMsg, "already running") {
						enc.Encode(map[string]interface{}{"ok": true, "port": msg.Port})
					} else {
						log.Printf("v9net: forward port %d failed: %s\n", msg.Port, errMsg)
						enc.Encode(map[string]interface{}{"ok": false, "error": errMsg})
					}
				}
			case "unforward":
				local := fmt.Sprintf("0.0.0.0:%d", msg.Port)
				body := strings.NewReader(fmt.Sprintf(`{"local":"%s","protocol":"tcp"}`, local))
				req, _ := http.NewRequest("POST", "/services/forwarder/unexpose", body)
				req.Header.Set("Content-Type", "application/json")
				rec := &responseRecorder{code: 200}
				servicesMux.ServeHTTP(rec, req)
				log.Printf("v9net: - stopped forwarding port %d\n", msg.Port)
				enc.Encode(map[string]interface{}{"ok": true, "port": msg.Port})
			default:
				enc.Encode(map[string]interface{}{"ok": false, "error": "unknown action"})
			}
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

type responseRecorder struct {
	code int
	body strings.Builder
	hdr  http.Header
}

func (r *responseRecorder) Header() http.Header {
	if r.hdr == nil {
		r.hdr = make(http.Header)
	}
	return r.hdr
}
func (r *responseRecorder) Write(b []byte) (int, error) { return r.body.Write(b) }
func (r *responseRecorder) WriteHeader(code int)         { r.code = code }
