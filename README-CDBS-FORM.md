# CDBS eligibility check form: deploy notes (GYA internal)

## Files
- cdbs/index.html     The kids page, eligibility check form at the top
- api/cdbs-check.js   Vercel function: emails each submission via Synergy's SMTP2GO account
                      To: info@synergydentalgroup.com.au   CC: rowayne@gyaclients.com
                      Reply-To is set to the parent's email, so the practice can just hit reply

## Where the function goes
The page posts to /api/cdbs-check on book.synergydentalgroup.com.au first, and if that
doesn't exist it automatically falls back to https://freeconsult.synergydentalgroup.com.au/api/cdbs-check.
- If book. is hosted on Vercel: add api/cdbs-check.js to that project (folder api/ at the root). Done.
- If book. is NOT on Vercel: add api/cdbs-check.js to the freeconsult Vercel project's api/ folder instead
  and redeploy that project. CORS for book. is already allowed in the file.
Never upload the function anywhere it would be served as a plain file (it holds the SMTP2GO key).

Optional env vars to change recipients without editing code: CDBS_TO, CDBS_CC (comma separated).

## Test before announcing
1. Fill the form on the live page. A valid test Medicare number is 2123 45670 1, ref number 2.
2. Confirm the email lands in info@ with the CC, all fields present, and Reply-To = the parent email.
3. Tag Assistant / Meta Test Events: dataLayer events cdbs_check_start, cdbs_check_step_2,
   cdbs_check_step_3, cdbs_check_submit; Meta "Lead" fires on submit (no personal data sent to Meta).

## Notes
- Form validates the Medicare number checksum, IRN (1 digit), and age 0 to 17 from the date of birth.
- Booking widget is still on the page, lower down, for families who already know they're eligible.
