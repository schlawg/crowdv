import http.server as s
import socketserver
import random
import argparse
import json
import os
import pymongo

files = (
    "a",
    "b",
    "c",
    "d",
    "e",
    "f",
    "g",
    "h"
)
ranks = (
    "1",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8"
)
rank_words = (
    "one",
    "two",
    "three",
    "four",
    "five",
    "six",
    "seven",
    "eight"
)
pieces = (
    "pawn",
    "bishop",
    "knight",
    "rook",
    "queen",
    "king"
)
actions = (
    "castle",
    "short castle",
    "long castle",
    "resign",
    "draw",
    "skip",
    "repeat",
    "yes",
    "no",
    "red",
    "yellow",
    "green",
    "blue",
    "rematch",
    "again"
)
ignores = (
    "takes",
    "captures",
    "check",
    "mate",
)

vocab = files + rank_words + pieces + actions + ignores + ("next", "promote")

coll = None 

# there are libraries for this, but then i'd have to internet
def is_valid(uci: str) -> bool:
    s_f, s_r, d_f, d_r = uci.split(" ")
    delta_f = files.index(d_f) - files.index(s_f)
    delta_r = ranks.index(d_r) - ranks.index(s_r)
    if delta_f == 0:
        return delta_r != 0
    elif delta_r == 0:
        return delta_f != 0
    elif abs(delta_f) == abs(delta_r):
        return True
    elif abs(delta_f) <= 2 and abs(delta_r) <= 2:
        return True
    return False

def chance(p: float) -> bool:
    return random.random() < p

def pick(lst: list) -> str:
    return random.choice(lst)

def constrained_uci(s_f: str = None, s_r: str = None, d_f: str = None, d_r: str = None):
    s_f = files if s_f == None else list(s_f)
    s_r = ranks if s_r == None else list(s_r)
    d_f = files if d_f == None else list(d_f)
    d_r = ranks if d_r == None else list(d_r)
    while True:
        uci = f"{pick(s_f)} {pick(s_r)} {pick(d_f)} {pick(d_r)}"
        if is_valid(uci):
            return uci

def get_phrase():
    if (chance(.2)):
        p = f"{pick(pieces)} {pick(ignores[:2])} {pick(['pawn','bishop','knight','rook','queen'])}"
        if p != "king takes queen" and p != "king captures queen": # how embarrasing
            return p + (f" {pick(ignores[2:])}" if chance(.05) else '')
    if (chance(.1)): # pawn promotes san
        return (f"{'pawn ' if chance(.6) else ''}{pick(files)} {pick(['1', '8'])}"
                + f"{pick([' promote ', ' '])}{'queen' if chance(.8) else 'knight'}"
        )
    if (chance(.2)): # san
        return f"{pick(pieces)} {pick(files)} {pick(ranks)} {pick(ignores[2:]) if chance(.05) else ''}".strip()
    if (chance(.025)): # actions
        return pick(actions)
    return constrained_uci() + (f" {pick(ignores[2:])}" if chance(.05) else "")

class _CrowdVoiceHandler(s.BaseHTTPRequestHandler):
    def do_POST(self):
        global coll
        len_hdr = self.headers.get("Content-Length")
        if (len_hdr != None 
            and int(len_hdr) > 0 
            and int(len_hdr) < 1000 
            and self.path == "/" 
            and self.headers.get("Content-Type") == "application/json"):
            try:
                result = json.loads(self.rfile.read(int(len_hdr)).decode())
                result["ip"] = self.headers.get("x-real-ip")
                pyres = coll.insert_one(result)
                print(pyres.acknowledged, pyres.inserted_id)
                print(result)
            except Exception as e:
                print(e)
                self.send_response_only(500, "Go away bot")
                return
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        out = json.dumps({ "next": get_phrase() })
        self.send_header("Content-Length", len(out))
        self.end_headers()
        self.wfile.write(out.encode())
        self.wfile.flush()

class _MongoContextMgr:
    def __init__(self, host):
        self.client = pymongo.MongoClient(f"mongodb://{host}/crowdv?compressors=zstd")
        self.client.admin.command("ping")
        self.db = self.client.get_default_database()
        assert self.db.name == "crowdv"

    def __enter__(self):
        return self.db

    def __exit__(self, exc_type, exc_value, exc_traceback):
        self.client.close()

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("host", default="127.0.0.1", nargs="?")
    host = parser.parse_args().host

    with open(os.path.join(os.path.dirname(__file__), "root/vocabulary.json"), "w") as vf:
        json.dump(vocab, vf)
    with _MongoContextMgr(host) as db:
        global coll
        coll = db.crowdv
        with socketserver.TCPServer(("127.0.0.1", 8000), _CrowdVoiceHandler) as httpd:
            print("serving at port", 8000)
            httpd.serve_forever()    

if __name__ == "__main__":
    main()
