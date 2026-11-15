"""Generates public/samples/acme-analytics-msa.pdf, a fictional 3-page SaaS contract
used to try the upload flow. Run: python3 scripts/make-sample-contract.py (needs reportlab)."""
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak

st = getSampleStyleSheet()
H, B = st["Heading2"], st["BodyText"]
B.leading = 15

pages = [
    [
        ("title", "MASTER SUBSCRIPTION AGREEMENT"),
        ("p", "This Master Subscription Agreement (the \"Agreement\") is entered into between Acme Analytics, Inc., a Delaware corporation (\"Acme\"), and Northwind Logistics, LLC (\"Customer\"). This document is fictional sample data."),
        ("h", "1. Definitions"),
        ("p", "\"Services\" means the Acme Analytics cloud platform described in an Order Form. \"Named User\" means an individual authorised by Customer to use the Services. \"Order Form\" means an ordering document signed by both parties that references this Agreement."),
        ("h", "2. Subscription Term"),
        ("p", "2.1 Initial Term. The initial Subscription Term begins on February 1, 2026 and ends on January 31, 2027."),
        ("p", "2.2 Use of Services. Acme grants Customer a non-exclusive, non-transferable right to access and use the Services during the Subscription Term, solely for Customer's internal business purposes."),
        ("h", "3. Customer Responsibilities"),
        ("p", "Customer is responsible for all activity under its accounts and will use commercially reasonable efforts to prevent unauthorised access to the Services."),
    ],
    [
        ("h", "4. Renewal"),
        ("p", "4.1 Automatic Renewal. Each Subscription Term will automatically renew for successive twelve (12) month periods unless either party gives written notice of non-renewal at least sixty (60) days before the end of the then-current term."),
        ("p", "4.2 Renewal Pricing. Fees for any renewal term will not increase by more than six percent (6%) over the fees for the prior term."),
        ("h", "5. Fees and Payment"),
        ("p", "5.1 Invoicing. Fees are invoiced annually in advance and are due within thirty (30) days of the invoice date."),
        ("p", "5.2 Overages. Named Users added during a Subscription Term in excess of the quantity on the Order Form are billed at Acme's then-current list price, pro-rated for the remainder of the term."),
        ("p", "5.3 Taxes. Fees exclude taxes. Customer is responsible for all sales, use and similar taxes, other than taxes on Acme's income."),
        ("h", "6. Term and Termination"),
        ("p", "Either party may terminate this Agreement for cause on thirty (30) days' written notice of a material breach that remains uncured at the end of that period."),
    ],
    [
        ("title", "ORDER FORM #AC-2207"),
        ("p", "This Order Form is governed by the Master Subscription Agreement between Acme Analytics, Inc. and Northwind Logistics, LLC."),
        ("h", "Subscription"),
        ("p", "Product: Acme Analytics Enterprise"),
        ("p", "Named Users: 120"),
        ("p", "Annual Subscription Fee: USD 86,400"),
        ("p", "Subscription Term: February 1, 2026 to January 31, 2027"),
        ("h", "Special Terms"),
        ("p", "Seat Reduction. Customer may reduce the number of Named Users by up to fifteen percent (15%) effective at renewal, provided Customer gives written notice within the non-renewal notice period in Section 4.1 of the Agreement."),
        ("p", "Signed for Acme Analytics, Inc.: J. Rivera, VP Sales.  Signed for Northwind Logistics, LLC: M. Chen, VP Finance."),
    ],
]

story = []
for i, page in enumerate(pages):
    for kind, text in page:
        if kind == "title":
            story += [Paragraph(text, st["Title"]), Spacer(1, 8)]
        elif kind == "h":
            story.append(Paragraph(text, H))
        else:
            story += [Paragraph(text, B), Spacer(1, 4)]
    if i < len(pages) - 1:
        story.append(PageBreak())

SimpleDocTemplate("public/samples/acme-analytics-msa.pdf", pagesize=letter, title="Acme Analytics MSA (sample)").build(story)
print("wrote public/samples/acme-analytics-msa.pdf")
