package grpc_exec

import (
	"context"
	"io"
	"net"
	"testing"
	"time"

	pb "github.com/maceip/v9/grpc_exec/grpcexecpb"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/test/bufconn"
)

func setupTunnelClient(t *testing.T) pb.TunnelServiceClient {
	t.Helper()
	lis := bufconn.Listen(1 << 20)
	s := grpc.NewServer()
	pb.RegisterTunnelServiceServer(s, &TunnelServer{})
	go s.Serve(lis)
	t.Cleanup(s.GracefulStop)

	conn, err := grpc.NewClient("passthrough:///bufconn",
		grpc.WithContextDialer(func(ctx context.Context, _ string) (net.Conn, error) {
			return lis.DialContext(ctx)
		}),
		grpc.WithTransportCredentials(insecure.NewCredentials()),
	)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { conn.Close() })
	return pb.NewTunnelServiceClient(conn)
}

func startEchoServer(t *testing.T) (host string, port uint32) {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { ln.Close() })

	go func() {
		for {
			conn, err := ln.Accept()
			if err != nil {
				return
			}
			go func(c net.Conn) {
				defer c.Close()
				_, _ = io.Copy(c, c)
			}(conn)
		}
	}()

	addr := ln.Addr().(*net.TCPAddr)
	return "127.0.0.1", uint32(addr.Port)
}

func TestOpenTcpTunnelRoundTrip(t *testing.T) {
	client := setupTunnelClient(t)
	host, port := startEchoServer(t)

	stream, err := client.OpenTcp(context.Background())
	if err != nil {
		t.Fatalf("OpenTcp: %v", err)
	}

	if err := stream.Send(&pb.TunnelClientEvent{
		Event: &pb.TunnelClientEvent_Open{
			Open: &pb.OpenTcpRequest{Address: host, Port: port},
		},
	}); err != nil {
		t.Fatalf("send open: %v", err)
	}

	ev, err := stream.Recv()
	if err != nil {
		t.Fatalf("recv opened: %v", err)
	}
	if ev.GetOpened() == nil {
		t.Fatalf("expected opened event, got %#v", ev.Event)
	}

	payload := []byte("hello over tunnel")
	if err := stream.Send(&pb.TunnelClientEvent{
		Event: &pb.TunnelClientEvent_Data{Data: payload},
	}); err != nil {
		t.Fatalf("send data: %v", err)
	}

	ev, err = stream.Recv()
	if err != nil {
		t.Fatalf("recv data: %v", err)
	}
	if got := string(ev.GetData()); got != string(payload) {
		t.Fatalf("tunnel payload = %q, want %q", got, payload)
	}

	if err := stream.Send(&pb.TunnelClientEvent{
		Event: &pb.TunnelClientEvent_Close{Close: &pb.CloseTunnel{}},
	}); err != nil {
		t.Fatalf("send close: %v", err)
	}
	stream.CloseSend()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	done := make(chan *pb.TunnelServerEvent, 1)
	go func() {
		ev, _ := stream.Recv()
		done <- ev
	}()

	select {
	case <-ctx.Done():
		t.Fatal("timed out waiting for close event")
	case ev := <-done:
		if ev != nil && ev.GetClosed() == nil {
			t.Fatalf("expected closed event, got %#v", ev.Event)
		}
	}
}
