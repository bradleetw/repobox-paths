"""Headless browser walk of the site with the GitHub API mocked.
Run: uv run --with playwright==1.64.1 python tests/e2e_walk.py <shots-dir>
Not part of `node --test`."""
import http.server, json, pathlib, socketserver, sys, threading
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
FIX = ROOT / "tests" / "fixtures"
SHOTS = pathlib.Path(sys.argv[1]); SHOTS.mkdir(parents=True, exist_ok=True)
STEM = "octo__demo"
CFG = json.dumps({"repo": "bradleetw/repobox-library", "token": "tok"})

class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=str(ROOT), **k)
    def log_message(self, *a): pass
srv = socketserver.TCPServer(("127.0.0.1", 0), H); BASE = f"http://127.0.0.1:{srv.server_address[1]}"
threading.Thread(target=srv.serve_forever, daemon=True).start()

def check(c, msg):
    print(("ok   " if c else "FAIL ") + msg)
    if not c: check.failed = True
check.failed = False

def mock(page, index=200, repo=200, svg="svg"):
    def h(route):
        u = route.request.url
        def r(status, body="", ct="text/plain"): route.fulfill(status=status, body=body, content_type=ct)
        if u.endswith("/contents/local/index.json"):
            return r(index, (FIX / "index.json").read_text()) if index == 200 else r(index)
        if u.endswith(f"/contents/local/{STEM}.paths.json"): return r(200, (FIX / f"{STEM}.paths.json").read_text())
        for st_ in ("octo__demo", "octo__tool"):
            if u.endswith(f"/contents/local/{st_}.usage.json"): return r(200, (FIX / f"{st_}.usage.json").read_text())
        if u.endswith(f"/contents/local/{STEM}.svg"):
            f = FIX / ("evil.svg" if svg == "evil" else f"{STEM}.svg"); return r(200, f.read_text())
        if u.endswith("/repos/bradleetw/repobox-library"): return r(repo, "{}")
        r(404)
    page.route("https://api.github.com/**", h)

with sync_playwright() as p:
    b = p.chromium.launch()
    def newpage(cfg=True, **kw):
        ctx = b.new_context(viewport={"width": 1280, "height": 900}); pg = ctx.new_page()
        pg.errors = []
        pg.on("console", lambda m: m.type == "error" and pg.errors.append(m.text))
        pg.on("pageerror", lambda e: pg.errors.append(str(e)))
        if cfg: pg.add_init_script(f"localStorage.setItem('repobox-paths.cfg', {json.dumps(CFG)})")
        mock(pg, **kw); return pg

    pg = newpage(); pg.goto(f"{BASE}/index.html"); pg.wait_for_selector("a.card")
    check("octo/demo" in pg.inner_text("a.card") and "請求路徑 2 條" in pg.inner_text("a.card") and "使用流程" in pg.inner_text("a.card"), "index card renders")
    cards = pg.locator("a.card")
    check(cards.count() == 3, "3 index cards")
    check("使用流程" in cards.nth(1).inner_text() and "請求路徑" not in cards.nth(1).inner_text(), "usage-only card has only usage tag")
    check("請求路徑 3 條" in cards.nth(2).inner_text() and "使用流程" not in cards.nth(2).inner_text(), "old-style card falls back to entries")
    pg.screenshot(path=SHOTS / "01-index.png")
    pg.click("a.card >> nth=0"); pg.wait_for_selector("svg.dia")
    check(pg.url.endswith(f"view.html#{STEM}"), "card links to view")
    check(pg.locator("ol.steps li").count() == 5, "5 steps listed")
    check(pg.locator("ol.steps li.cur").count() == 1, "one current step")
    check(pg.locator("svg .node.on").count() == 4 and pg.locator("svg .node.dim").count() == 3, "4 on / 3 dim nodes")
    check(pg.locator("svg .badge").count() == 5, "5 badges")
    check(pg.locator("svg .edge.on").count() == 0, "no edge lit at step 1")
    pg.screenshot(path=SHOTS / "02-view-step1.png")
    pg.keyboard.press("ArrowRight")
    check(pg.locator("svg .edge.on").count() == 1, "edge lit after ArrowRight")
    pg.click("ol.steps li:nth-child(3)")
    check(pg.locator("ol.steps li:nth-child(3).cur").count() == 1, "click step 3 -> current")
    check(pg.locator("svg .node.cur").get_attribute("id") == "p-n-auth", "current node is auth")
    check(pg.locator("svg .edge.on").count() == 2, "2 edges lit at step 3")
    pg.screenshot(path=SHOTS / "03-view-step3.png")
    pg.click("svg #p-n-db")
    check(pg.locator("ol.steps li:nth-child(4).cur").count() == 1, "click diagram node -> step 4")
    pg.click("svg #p-n-api"); check(pg.locator("ol.steps li:nth-child(5).cur").count() == 1, "repeat node: next visit")
    pg.click("svg #p-n-api"); check(pg.locator("ol.steps li:nth-child(2).cur").count() == 1, "repeat node: wraps to first visit")
    pg.click(".entries button:nth-child(2)")
    check(pg.locator("ol.steps li").count() == 5 and pg.locator("ol.steps li.cur").count() == 1, "switch entry")
    check(pg.locator("svg .node.on").count() == 5 and pg.locator("svg .badge").count() == 5, "job entry nodes/badges")
    api_badges = pg.evaluate("[...document.querySelectorAll('.badge text')].map(t=>t.textContent)")
    check(sorted(api_badges) == ["1", "2", "3", "4", "5"], f"badges per step {api_badges}")
    link = pg.locator("ol.steps li a").first
    check(link.get_attribute("target") == "_blank" and "noopener" in link.get_attribute("rel")
          and link.get_attribute("href").startswith("https://github.com/octo/demo/blob/"), "source link attrs")
    pg.screenshot(path=SHOTS / "04-view-mcp.png")
    pg.set_viewport_size({"width": 390, "height": 844}); pg.wait_for_timeout(200)
    y_svg = pg.locator(".fig").bounding_box(); y_list = pg.locator("ol.steps").bounding_box()
    check(y_list["y"] >= y_svg["y"] + y_svg["height"] - 1, "narrow: list below diagram")
    check(pg.evaluate("document.documentElement.scrollWidth <= 390"), "narrow: no horizontal overflow")
    pg.screenshot(path=SHOTS / "05-narrow.png", full_page=True)
    check(not pg.errors, f"console clean (main) {pg.errors}")

    # ---- usage tab ----
    pg = newpage(); pg.goto(f"{BASE}/view.html#{STEM}"); pg.wait_for_selector("svg.dia")
    check(pg.locator(".tabs button:not([disabled])").count() == 2, "both tabs enabled")
    pg.click(".tabs button[data-tab=usage]"); pg.wait_for_selector(".branches")
    check(pg.url.endswith(f"#{STEM}/usage"), "tab switch updates hash")
    check("指令都從 repo 或官方文件原樣抄出；文件本身若過期，照打也可能失敗。" in pg.inner_text(".notice"), "warning line")
    check(pg.locator("section.branch").count() == 2, "2 branches")
    x = pg.evaluate("[...document.querySelectorAll('section.branch')].map(e=>e.getBoundingClientRect().x)")
    check(abs(x[0] - x[1]) > 100, f"branches side by side {x}")
    check(pg.locator(".copy").count() >= 6, "copy buttons present")
    check(pg.locator(".danger").count() == 2, "danger notes (curl|bash, sudo)")
    check("需要管理權限" in pg.inner_text(".danger >> nth=1"), "sudo note text")
    check("存成 demo.yaml" in pg.inner_text(".branches"), "config file label")
    check("沒有可驗證的指令" in pg.inner_text(".branches"), "unverified step")
    check("<your-token>" in pg.locator("pre code >> nth=1").inner_text() and "\n" in pg.locator("pre code >> nth=1").text_content(), "code kept verbatim with newlines")
    check("只適用 單一執行檔" in pg.inner_text(".firstuse"), "for-branch label")
    check(pg.locator(".firstuse h2").inner_text() == "送出第一個請求", "first use heading")
    ext = pg.locator(".snip .src a[href^='https://docs.example.invalid']")
    check(ext.count() == 1 and ext.get_attribute("rel") == "noopener noreferrer" and ext.get_attribute("target") == "_blank", "external doc link")
    check(pg.locator(".snip .src a[href^='https://github.com/octo/demo/blob/0123456789abcdef0123456789abcdef01234567/README.md#L12']").count() == 1, "repo source link pinned to sha")
    pg.context.grant_permissions(["clipboard-read", "clipboard-write"], origin=BASE)
    pg.click(".copy >> nth=0")
    check("curl -sL" in pg.evaluate("navigator.clipboard.readText()"), "copy writes to clipboard")
    pg.screenshot(path=SHOTS / "10-usage.png", full_page=True)
    pg.set_viewport_size({"width": 390, "height": 844}); pg.wait_for_timeout(200)
    y = pg.evaluate("[...document.querySelectorAll('section.branch')].map(e=>e.getBoundingClientRect().y)")
    check(y[1] > y[0] + 100, "narrow: branches stacked")
    check(pg.evaluate("document.documentElement.scrollWidth <= 390"), "narrow usage: no horizontal overflow")
    pg.screenshot(path=SHOTS / "11-usage-narrow.png", full_page=True)
    check(not pg.errors, f"console clean (usage) {pg.errors}")

    pg = newpage(); pg.goto(f"{BASE}/view.html#{STEM}/usage"); pg.wait_for_selector(".branches")
    check(pg.locator(".tabs button[data-tab=usage][aria-selected=true]").count() == 1, "hash /usage opens usage tab")
    pg.click(".tabs button[data-tab=paths]"); pg.wait_for_selector("svg.dia")
    check(pg.url.endswith(f"#{STEM}"), "back to paths drops suffix")

    pg = newpage(); pg.goto(f"{BASE}/view.html#octo__tool"); pg.wait_for_selector(".branches")
    check(pg.locator(".tabs button[data-tab=paths]").is_disabled() and "這次分析沒有請求路徑" in pg.inner_text(".tabs"), "usage-only: paths tab disabled with note")
    check(pg.locator(".tabs button[data-tab=usage][aria-selected=true]").count() == 1, "usage-only: usage tab default")
    check(pg.url.endswith("#octo__tool/usage"), "usage-only: hash normalised to /usage")
    pg.screenshot(path=SHOTS / "12-usage-only.png")
    check(not pg.errors, f"console clean (usage-only) {pg.errors}")

    pg = newpage(svg="evil"); pg.goto(f"{BASE}/view.html#{STEM}"); pg.wait_for_selector("ol.steps li")
    check("沒通過安全檢查" in pg.inner_text(".notice"), "evil svg: warning shown")
    check(pg.locator("svg").count() == 0 and pg.locator("ol.steps li").count() == 5, "evil svg: no svg, list still there")
    pg.screenshot(path=SHOTS / "06-rejected.png")
    check(not pg.errors, f"console clean (evil) {pg.errors}")

    pg = newpage(cfg=False); pg.goto(f"{BASE}/index.html"); pg.wait_for_selector("form.setup")
    check(pg.input_value("input[name=repo]") == "bradleetw/repobox-library", "setup form default repo")
    pg.screenshot(path=SHOTS / "07-setup.png")
    pg.fill("input[name=token]", "tok"); pg.click("button[type=submit]"); pg.wait_for_selector("a.card")
    check(True, "setup form saves and loads list")
    check(not pg.errors, f"console clean (setup) {pg.errors}")

    pg = newpage(index=404, repo=200); pg.goto(f"{BASE}/index.html"); pg.wait_for_selector(".notice")
    check("還沒有" in pg.inner_text(".notice"), "empty state"); pg.screenshot(path=SHOTS / "08-empty.png")
    pg = newpage(index=404, repo=404); pg.goto(f"{BASE}/index.html"); pg.wait_for_selector(".notice")
    check("Token" in pg.inner_text(".notice"), "404 repo -> auth state")
    pg = newpage(index=401); pg.goto(f"{BASE}/index.html"); pg.wait_for_selector(".notice")
    check("Token" in pg.inner_text(".notice"), "401 -> auth state")
    b.close()
sys.exit(1 if check.failed else 0)
