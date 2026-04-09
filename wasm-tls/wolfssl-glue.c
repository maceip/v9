/**
 * wolfssl-glue.c — Thin C wrapper exposing wolfSSL TLS to JavaScript.
 *
 * wolfSSL's custom I/O callbacks (CBIORecv/CBIOSend) are implemented in JS
 * via Emscripten's EM_JS / function pointers. The JS side provides raw TCP
 * bytes from the gvisor virtual network; wolfSSL handles all TLS framing,
 * handshake, and encryption/decryption.
 *
 * Exported functions (via EMSCRIPTEN_KEEPALIVE):
 *   wssl_init()             — one-time library init
 *   wssl_new(hostname)      — create TLS session with SNI
 *   wssl_handshake(id)      — drive handshake (call repeatedly until done)
 *   wssl_write(id, ptr, n)  — encrypt and send data
 *   wssl_read(id, ptr, n)   — decrypt received data
 *   wssl_shutdown(id)       — graceful TLS shutdown
 *   wssl_free(id)           — destroy session
 *   wssl_push_recv(id, ptr, n) — JS pushes raw TCP bytes into session recv buffer
 *   wssl_pull_send(id, ptr, n) — JS pulls encrypted bytes to send over TCP
 */

#include <wolfssl/options.h>
#include <wolfssl/ssl.h>
#include <wolfssl/wolfcrypt/error-crypt.h>
#include <emscripten/emscripten.h>
#include <string.h>
#include <stdlib.h>

/* ── Ring buffer for TCP ↔ wolfSSL I/O ─────────────────────────── */

#define BUF_SIZE (128 * 1024)  /* 128KB per direction */
#define MAX_SESSIONS 16

typedef struct {
    unsigned char data[BUF_SIZE];
    int head;
    int tail;
    int count;
} RingBuf;

static void rb_init(RingBuf *rb) {
    rb->head = rb->tail = rb->count = 0;
}

static int rb_write(RingBuf *rb, const unsigned char *src, int len) {
    int wrote = 0;
    while (wrote < len && rb->count < BUF_SIZE) {
        rb->data[rb->head] = src[wrote];
        rb->head = (rb->head + 1) % BUF_SIZE;
        rb->count++;
        wrote++;
    }
    return wrote;
}

static int rb_read(RingBuf *rb, unsigned char *dst, int len) {
    int rd = 0;
    while (rd < len && rb->count > 0) {
        dst[rd] = rb->data[rb->tail];
        rb->tail = (rb->tail + 1) % BUF_SIZE;
        rb->count--;
        rd++;
    }
    return rd;
}

/* ── Session state ──────────────────────────────────────────────── */

typedef struct {
    int active;
    WOLFSSL_CTX *ctx;
    WOLFSSL *ssl;
    RingBuf recv_buf;   /* TCP data in  (from JS/gvisor → wolfSSL) */
    RingBuf send_buf;   /* TCP data out (from wolfSSL → JS/gvisor) */
} TlsSession;

static TlsSession sessions[MAX_SESSIONS];
static int initialized = 0;

/* ── Custom I/O callbacks ───────────────────────────────────────── */

static int io_recv(WOLFSSL *ssl, char *buf, int sz, void *ctx) {
    TlsSession *s = (TlsSession *)ctx;
    int n = rb_read(&s->recv_buf, (unsigned char *)buf, sz);
    if (n == 0) return WOLFSSL_CBIO_ERR_WANT_READ;
    return n;
}

static int io_send(WOLFSSL *ssl, char *buf, int sz, void *ctx) {
    TlsSession *s = (TlsSession *)ctx;
    int n = rb_write(&s->send_buf, (unsigned char *)buf, sz);
    if (n == 0) return WOLFSSL_CBIO_ERR_WANT_WRITE;
    return n;
}

/* ── Exported API ───────────────────────────────────────────────── */

EMSCRIPTEN_KEEPALIVE
int wssl_init(void) {
    if (initialized) return 0;
    int ret = wolfSSL_Init();
    if (ret != WOLFSSL_SUCCESS) return -1;
    initialized = 1;
    memset(sessions, 0, sizeof(sessions));
    return 0;
}

EMSCRIPTEN_KEEPALIVE
int wssl_new(const char *hostname) {
    int id = -1;
    for (int i = 0; i < MAX_SESSIONS; i++) {
        if (!sessions[i].active) { id = i; break; }
    }
    if (id < 0) return -1;

    TlsSession *s = &sessions[id];
    memset(s, 0, sizeof(TlsSession));
    rb_init(&s->recv_buf);
    rb_init(&s->send_buf);

    s->ctx = wolfSSL_CTX_new(wolfTLSv1_3_client_method());
    if (!s->ctx) {
        /* Fallback to TLS 1.2+ if 1.3-only method unavailable */
        s->ctx = wolfSSL_CTX_new(wolfSSLv23_client_method());
    }
    if (!s->ctx) return -2;

    /* Don't verify certs for now — CA roots need separate loading */
    wolfSSL_CTX_set_verify(s->ctx, WOLFSSL_VERIFY_NONE, NULL);

    s->ssl = wolfSSL_new(s->ctx);
    if (!s->ssl) { wolfSSL_CTX_free(s->ctx); return -3; }

    /* Set custom I/O */
    wolfSSL_SetIOReadCtx(s->ssl, s);
    wolfSSL_SetIOWriteCtx(s->ssl, s);
    wolfSSL_SSLSetIORecv(s->ssl, io_recv);
    wolfSSL_SSLSetIOSend(s->ssl, io_send);

    /* SNI */
    if (hostname && hostname[0]) {
        wolfSSL_UseSNI(s->ssl, WOLFSSL_SNI_HOST_NAME,
                       hostname, (unsigned short)strlen(hostname));
    }

    s->active = 1;
    return id;
}

EMSCRIPTEN_KEEPALIVE
int wssl_handshake(int id) {
    if (id < 0 || id >= MAX_SESSIONS || !sessions[id].active) return -1;
    int ret = wolfSSL_connect(sessions[id].ssl);
    if (ret == WOLFSSL_SUCCESS) return 0; /* done */
    int err = wolfSSL_get_error(sessions[id].ssl, ret);
    if (err == WOLFSSL_ERROR_WANT_READ || err == WOLFSSL_ERROR_WANT_WRITE) {
        return 1; /* need more I/O */
    }
    return -err; /* fatal error */
}

EMSCRIPTEN_KEEPALIVE
int wssl_write(int id, const unsigned char *data, int len) {
    if (id < 0 || id >= MAX_SESSIONS || !sessions[id].active) return -1;
    int ret = wolfSSL_write(sessions[id].ssl, data, len);
    if (ret <= 0) {
        int err = wolfSSL_get_error(sessions[id].ssl, ret);
        if (err == WOLFSSL_ERROR_WANT_WRITE) return 0;
        return -1;
    }
    return ret;
}

EMSCRIPTEN_KEEPALIVE
int wssl_read(int id, unsigned char *buf, int len) {
    if (id < 0 || id >= MAX_SESSIONS || !sessions[id].active) return -1;
    int ret = wolfSSL_read(sessions[id].ssl, buf, len);
    if (ret <= 0) {
        int err = wolfSSL_get_error(sessions[id].ssl, ret);
        if (err == WOLFSSL_ERROR_WANT_READ) return 0;
        if (err == WOLFSSL_ERROR_ZERO_RETURN) return -2; /* peer closed */
        return -1;
    }
    return ret;
}

EMSCRIPTEN_KEEPALIVE
int wssl_shutdown(int id) {
    if (id < 0 || id >= MAX_SESSIONS || !sessions[id].active) return -1;
    return wolfSSL_shutdown(sessions[id].ssl);
}

EMSCRIPTEN_KEEPALIVE
void wssl_free(int id) {
    if (id < 0 || id >= MAX_SESSIONS || !sessions[id].active) return;
    if (sessions[id].ssl) wolfSSL_free(sessions[id].ssl);
    if (sessions[id].ctx) wolfSSL_CTX_free(sessions[id].ctx);
    sessions[id].active = 0;
}

/* ── Buffer exchange: JS pushes TCP recv data, pulls TCP send data ── */

EMSCRIPTEN_KEEPALIVE
int wssl_push_recv(int id, const unsigned char *data, int len) {
    if (id < 0 || id >= MAX_SESSIONS || !sessions[id].active) return -1;
    return rb_write(&sessions[id].recv_buf, data, len);
}

EMSCRIPTEN_KEEPALIVE
int wssl_pull_send(int id, unsigned char *buf, int len) {
    if (id < 0 || id >= MAX_SESSIONS || !sessions[id].active) return -1;
    return rb_read(&sessions[id].send_buf, buf, len);
}

EMSCRIPTEN_KEEPALIVE
int wssl_send_pending(int id) {
    if (id < 0 || id >= MAX_SESSIONS || !sessions[id].active) return 0;
    return sessions[id].send_buf.count;
}
