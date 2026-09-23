import json, sys, datetime

p = "/root/flowvpn-cp/data/auth.json"
d = json.load(open(p))
print("top keys:", list(d.keys()))

def created(u):
    return str(u.get("createdAt") or u.get("created_at") or u.get("created") or "")

for k, v in d.items():
    if isinstance(v, list) and v and isinstance(v[0], dict):
        emails = [x for x in v if isinstance(x, dict) and "email" in x]
        if not emails:
            continue
        print("\n==", k, "count", len(v), "emails", len(emails))
        for u in sorted(emails, key=created)[-10:]:
            print("   %-40s created=%s premium=%s role=%s tv=%s" % (
                u.get("email"), created(u)[:19], u.get("premium") or u.get("plan"),
                u.get("role"), u.get("tokenVersion") or u.get("token_version")))

# look for the newest customer
print("\n== search jeff ==")
for k, v in d.items():
    if isinstance(v, list):
        for u in v:
            if isinstance(u, dict) and "jeff" in json.dumps(u).lower():
                print(k, json.dumps(u)[:600])
