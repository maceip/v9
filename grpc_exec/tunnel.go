// Copyright 2026 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

package grpc_exec

import (
	"context"
	"io"
	"net"
	"time"

	pb "github.com/maceip/v9/grpc_exec/grpcexecpb"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// TunnelServer implements the gRPC-backed network tunnel used by V9 clients.
// It deliberately supports only outbound TCP streams and is meant to replace
// the legacy multi-transport browser networking stack with one explicit path.
type TunnelServer struct {
	pb.UnimplementedTunnelServiceServer
	DialTimeout time.Duration
}

func (s *TunnelServer) dialTimeout() time.Duration {
	if s != nil && s.DialTimeout > 0 {
		return s.DialTimeout
	}
	return 10 * time.Second
}

func (s *TunnelServer) OpenTcp(stream pb.TunnelService_OpenTcpServer) error {
	first, err := stream.Recv()
	if err != nil {
		if err == io.EOF {
			return status.Error(codes.InvalidArgument, "empty stream: first message must be OpenTcpRequest")
		}
		return err
	}

	req := first.GetOpen()
	if req == nil {
		return status.Error(codes.InvalidArgument, "first message must be OpenTcpRequest")
	}
	if req.GetAddress() == "" {
		return status.Error(codes.InvalidArgument, "host is required")
	}
	if req.GetPort() <= 0 || req.GetPort() > 65535 {
		return status.Error(codes.InvalidArgument, "port must be between 1 and 65535")
	}

	ctx, cancel := context.WithTimeout(stream.Context(), s.dialTimeout())
	defer cancel()

	conn, err := (&net.Dialer{}).DialContext(ctx, "tcp", net.JoinHostPort(req.GetAddress(), itoa32(int(req.GetPort()))))
	if err != nil {
		return stream.Send(&pb.TunnelServerEvent{
			Event: &pb.TunnelServerEvent_Error{
				Error: &pb.TunnelError{
					Message: err.Error(),
				},
			},
		})
	}
	defer conn.Close()

	if err := stream.Send(&pb.TunnelServerEvent{
		Event: &pb.TunnelServerEvent_Opened{
			Opened: &pb.TunnelOpened{
				RemoteAddress: req.GetAddress(),
				RemotePort:    req.GetPort(),
			},
		},
	}); err != nil {
		return err
	}

	writeErrCh := make(chan error, 1)
	go func() {
		for {
			ev, err := stream.Recv()
			if err != nil {
				if err == io.EOF {
					writeErrCh <- nil
				} else {
					writeErrCh <- err
				}
				return
			}
			switch msg := ev.Event.(type) {
			case *pb.TunnelClientEvent_Data:
				if len(msg.Data) == 0 {
					continue
				}
				if _, err := conn.Write(msg.Data); err != nil {
					writeErrCh <- err
					return
				}
			case *pb.TunnelClientEvent_Close:
				writeErrCh <- nil
				return
			default:
				writeErrCh <- status.Error(codes.InvalidArgument, "unexpected tunnel client event")
				return
			}
		}
	}()

	readBuf := make([]byte, 32*1024)
	for {
		_ = conn.SetReadDeadline(time.Now().Add(200 * time.Millisecond))
		n, err := conn.Read(readBuf)
		if n > 0 {
			payload := append([]byte(nil), readBuf[:n]...)
			if sendErr := stream.Send(&pb.TunnelServerEvent{
				Event: &pb.TunnelServerEvent_Data{
					Data: payload,
				},
			}); sendErr != nil {
				return sendErr
			}
		}
		if ne, ok := err.(net.Error); ok && ne.Timeout() {
			select {
			case recvErr := <-writeErrCh:
				if recvErr != nil {
					return recvErr
				}
				return stream.Send(&pb.TunnelServerEvent{
					Event: &pb.TunnelServerEvent_Closed{
						Closed: &pb.TunnelClosed{},
					},
				})
			default:
			}
			continue
		}
		if err != nil {
			closeMsg := &pb.TunnelClosed{}
			if err != io.EOF {
				closeMsg.Reason = err.Error()
			}
			return stream.Send(&pb.TunnelServerEvent{
				Event: &pb.TunnelServerEvent_Closed{
					Closed: closeMsg,
				},
			})
		}
	}
}

func itoa32(v int) string {
	if v == 0 {
		return "0"
	}
	var buf [16]byte
	i := len(buf)
	n := int(v)
	for n > 0 {
		i--
		buf[i] = byte('0' + (n % 10))
		n /= 10
	}
	return string(buf[i:])
}
