import asyncio, glob, os
from playwright.async_api import async_playwright
CAP = """(t)=>{let d=document.getElementById('cap');if(!d){d=document.createElement('div');d.id='cap';d.style.cssText='position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#000c;color:#fff;padding:12px 22px;border-radius:12px;font:20px system-ui;z-index:9999;max-width:90%;text-align:center';document.body.appendChild(d)}d.textContent=t}"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=os.environ.get('CHROME','/usr/bin/google-chrome'))
        ctx = await b.new_context(viewport={'width':1280,'height':800}, record_video_dir='rec', record_video_size={'width':1280,'height':800})
        pg = await ctx.new_page(); await pg.goto('http://localhost:8787'); await pg.wait_for_timeout(800)
        cap = lambda t: pg.evaluate(CAP, t)
        await cap('Shagun Ledger: the wedding gift notebook, rebuilt for shaadi season'); await pg.wait_for_timeout(5000)
        await cap('Header pills show each sponsor integration live / offline (no API keys on this recording machine)'); await pg.wait_for_timeout(5000)
        entries = ['Sharma uncle ne 2100 diye', 'Gupta parivar ne ₹5,100 aur ek saree di', 'मेहता जी ने ११०० रुपये दिए', 'Verma aunty ne do hazaar ek sau diye', 'Priya didi gave 1001 and a silver coin']
        caps = ['Type or speak an entry in Hinglish…', 'Amounts with ₹ and commas, plus gifts like a saree', 'Devanagari text and Hindi digits', 'Number words: "do hazaar ek sau" = ₹2,100', 'English works too']
        for e, c in zip(entries, caps):
            await cap(c); await pg.fill('#entryText', ''); await pg.type('#entryText', e, delay=45)
            await pg.click('#parseBtn'); await pg.wait_for_timeout(1600); await pg.click('#saveBtn'); await pg.wait_for_timeout(1400)
        await cap('Running total, entry count, and thank-yous still pending'); await pg.wait_for_timeout(4500)
        await cap('Thank-you note in the guest\'s language (template now; Sarvam mayura translation when SARVAM_API_KEY is set)')
        await pg.select_option('#tyGuest', index=2); await pg.select_option('#tyLang', 'hi-IN'); await pg.click('#tyBtn'); await pg.wait_for_timeout(5000)
        await pg.select_option('#tyGuest', index=0); await pg.select_option('#tyLang', 'en-IN'); await pg.click('#tyBtn'); await pg.wait_for_timeout(4500)
        await cap('RSVP tracker gives the caterer a headcount')
        for n,c,s in [('Sharma family',4,'Coming'),('Iyer family',3,'Maybe'),('Kapoor ji',2,'Coming')]:
            await pg.fill('#rsvpName', n); await pg.fill('#rsvpCount', str(c)); await pg.select_option('#rsvpStatus', s); await pg.click('#rsvpBtn'); await pg.wait_for_timeout(1200)
        await pg.wait_for_timeout(2500)
        await pg.evaluate("document.getElementById('flags').scrollIntoView({behavior:'smooth'})")
        await cap('Flagsmith flags gate voice entry, thank-yous and RSVP; remote config sets the language list'); await pg.wait_for_timeout(6000)
        await cap('Live toggles need FLAGSMITH_ENVIRONMENT_KEY. Without it the app runs on safe defaults (shown here)'); await pg.wait_for_timeout(5000)
        await pg.goto('http://localhost:8787/metrics'); await pg.evaluate(CAP, 'NudgeBee: /healthz probes + Prometheus /metrics on Kubernetes; /api/ops reads NudgeBee recommendations'); await pg.wait_for_timeout(6000)
        await pg.goto('http://localhost:8787'); await pg.wait_for_timeout(500); await pg.evaluate(CAP, 'Shagun Ledger · TheAdaply (Shine Gupta + Akash) · github.com/Shine-5705/shagun-ledger'); await pg.wait_for_timeout(5000)
        await ctx.close(); await b.close()
asyncio.run(main())
