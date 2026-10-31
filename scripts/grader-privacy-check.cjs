// Grader privacy check (sleep-research C3): uploads a CSV on /grader of a running app (port 3100) and logs every
// network request after page load. Usage: node scripts/grader-privacy-check.cjs <path-to.csv>
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  const errs = [];
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:3100/grader', { waitUntil: 'networkidle' });
  const requests = [];
  p.on('request', r => requests.push(`${r.method()} ${r.url()}`));
  await p.setInputFiles('input[type=file]', process.argv[2]);
  await p.getByLabel(/Today's total cash/).fill('952350');
  await p.getByRole('button', { name: 'Grade my runway' }).click();
  await p.getByText('Wasted spend found').waitFor();
  await p.waitForTimeout(1500);
  const runway = await p.locator('section[aria-label=Results] .text-5xl').first().textContent();
  await p.screenshot({ path: '/tmp/grader-check.png', fullPage: true });
  console.log(JSON.stringify({ runway, requestsAfterLoad: requests, errs }, null, 1));
  await b.close();
})();
