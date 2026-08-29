import socket, json, sys, os
def rd(s):
    buf = b""
    while b":" not in buf: buf += s.recv(1)
    n, rest = buf.split(b":", 1); n = int(n); data = rest
    while len(data) < n: data += s.recv(n - len(data))
    return json.loads(data)
def send(s, i, cmd, params):
    msg = json.dumps([0, i, cmd, params]).encode()
    s.sendall(str(len(msg)).encode() + b":" + msg)
    while True:
        r = rd(s)
        if r[0] == 1 and r[1] == i:
            if r[2]: raise SystemExit(f"{cmd}: {r[2]}")
            return r[3]
s = socket.create_connection(("127.0.0.1", int(os.environ.get("MPORT", "2829"))), timeout=60); rd(s)
send(s, 1, "WebDriver:NewSession", {"capabilities": {}})
send(s, 2, "Marionette:SetContext", {"value": "chrome"})
script = sys.stdin.read()
print(json.dumps(send(s, 3, "WebDriver:ExecuteScript", {"script": script, "args": []})["value"], indent=1))
shot = os.environ.get("SHOT")
if shot:
    import base64, time; time.sleep(1.5)
    r = send(s, 4, "WebDriver:TakeScreenshot", {"full": True}); open(shot, "wb").write(base64.b64decode(r["value"]))
send(s, 5, "WebDriver:DeleteSession", {})
