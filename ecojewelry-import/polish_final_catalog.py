#!/usr/bin/env python3
"""Polish ECO JEWELRY catalog: natural Swedish copy, EUR price recalibration, single categories."""

from __future__ import annotations

import csv
import hashlib
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).parent
SRC = ROOT / "ECO_JEWELRY_133_PRODUKTER_SLUTGILTIG.csv"
OUT = ROOT / "ECO_JEWELRY_133_PRODUKTER_PREMIUM_GRANSKAD.csv"
REPORT = ROOT / "ECO_JEWELRY_133_PREMIUM_GRANSKAD_RAPPORT.txt"
ARTIFACT_OUT = Path("/opt/cursor/artifacts/ECO_JEWELRY_133_PRODUKTER_PREMIUM_GRANSKAD.csv")
ARTIFACT_REPORT = Path("/opt/cursor/artifacts/ECO_JEWELRY_133_PREMIUM_GRANSKAD_RAPPORT.txt")

# Invoice costs are in SEK (kr). Storefront prices are EUR.
SEK_PER_EUR = 11.0

# Attractive EUR endings for fashion jewelry
EUR_POINTS = [
    9.90, 12.90, 14.90, 16.90, 19.90, 22.90, 24.90, 27.90, 29.90,
    34.90, 39.90, 44.90, 49.90, 54.90, 59.90, 64.90, 69.90,
    74.90, 79.90, 84.90, 89.90, 94.90, 99.90, 109.90, 119.90,
]


def hpick(sku: str, options: list[str]) -> str:
    digest = hashlib.md5(sku.encode()).hexdigest()
    return options[int(digest[:8], 16) % len(options)]


def primary_category(cats: str) -> str:
    return cats.split(",")[0].strip()


def extract_design_from_name(name: str) -> str:
    """Keep design phrase; strip finish after dash when it is only color/finish."""
    # Preserve full name for display in copy when useful
    return name.strip()


def design_core(name: str) -> str:
    """Name without finish suffix after en-dash."""
    if " – " in name:
        left, right = name.split(" – ", 1)
        # Keep right if it is design (stjärngeometri, oändlighetshjärta), not finish
        finish_words = (
            "guldfärg", "silverfärg", "platinaton", "färgglad", "champagne",
            "rosa detalj", "lila detalj", "blå detalj",
        )
        if any(w in right.lower() for w in finish_words) and "stjärn" not in right.lower() and "oändlighet" not in right.lower():
            return left.strip()
        # Tiara – stjärngeometri: keep full
        return name.strip()
    return name.strip()


def finish_from_name(name: str) -> str | None:
    if " – " not in name:
        return None
    right = name.split(" – ", 1)[1].lower()
    if "silver" in right:
        return "silverfärgad"
    if "platina" in right:
        return "platinatonad"
    if "färgglad" in right:
        return "färgglad"
    if "rosa" in right:
        return "guldfärgad med rosa detaljer"
    if "lila" in right:
        return "guldfärgad med lila detaljer"
    if "blå" in right:
        return "guldfärgad med blå detaljer"
    if "champagne" in right:
        return "guldfärgad med champagne-toner"
    if "guld" in right:
        return "guldfärgad"
    return None


def material_from_description(desc: str) -> str | None:
    m = re.search(r"materialet ([^.<]+)", desc, re.I)
    if m:
        return m.group(1).strip()
    m = re.search(r"Material \(enligt leverantör\): ([^<]+)", desc)
    if m:
        return m.group(1).strip()
    return None


def material_from_row(row: dict) -> str | None:
    # Prefer long description supplier line — never mix finish into material base
    mat = material_from_description(row.get("Description", ""))
    if mat:
        return mat
    mat = material_from_description(row.get("Short description", ""))
    if mat:
        return mat
    # Fallback from short "i rostfritt stål" (stop before comma/finish)
    m = re.search(
        r" i ((?:rostfritt stål|legering|titan|koppar)[^,.]*)",
        row.get("Short description", ""),
        re.I,
    )
    if m:
        return m.group(1).strip()
    return None


def nice_eur(value: float) -> float:
    best = EUR_POINTS[0]
    for p in EUR_POINTS:
        if abs(p - value) < abs(best - value):
            best = p
    return best


def recalculate_price(cost_sek: float, category: str, old_price: float) -> float:
    """EUR retail: accessible premium. Costs in Meta are SEK; prices stay EUR."""
    cost_eur = max(cost_sek / SEK_PER_EUR, 0.35)

    # Cost-tier base in EUR (perceived value ladder)
    if cost_sek < 4:
        base = 14.90
    elif cost_sek < 7:
        base = 19.90
    elif cost_sek < 10:
        base = 24.90
    elif cost_sek < 14:
        base = 29.90
    elif cost_sek < 18:
        base = 34.90
    elif cost_sek < 22:
        base = 39.90
    elif cost_sek < 28:
        base = 44.90
    elif cost_sek < 35:
        base = 49.90
    elif cost_sek < 45:
        base = 59.90
    else:
        base = 69.90

    # Category premium / complexity
    cat_adj = {
        "Håraccessoarer": -4.0,
        "Örhängen": 0.0,
        "Ringar": 0.0,
        "Fotlänkar": -2.0,
        "Halsband": 2.0,
        "Armband": 2.0,
        "Handkedjor": 12.0,
        "Smyckesset": 18.0,
        "Accessoarer": 0.0,
    }.get(category, 0.0)

    cap = {
        "Håraccessoarer": 34.90,
        "Örhängen": 54.90,
        "Ringar": 49.90,
        "Fotlänkar": 44.90,
        "Halsband": 64.90,
        "Armband": 64.90,
        "Handkedjor": 74.90,
        "Smyckesset": 99.90,
        "Accessoarer": 39.90,
    }.get(category, 64.90)

    floor = {
        "Håraccessoarer": 9.90,
        "Örhängen": 14.90,
        "Ringar": 14.90,
        "Fotlänkar": 14.90,
        "Halsband": 19.90,
        "Armband": 19.90,
        "Handkedjor": 34.90,
        "Smyckesset": 44.90,
        "Accessoarer": 12.90,
    }.get(category, 14.90)

    target = base + cat_adj

    # Ensure healthy margin vs EUR cost (fees/shipping buffer)
    # Aim retail >= ~5x EUR cost, and gross margin roughly >= 70% before other costs
    target = max(target, cost_eur * 5.0, cost_eur / 0.30, floor)
    target = min(target, cap)

    # If previous price was already in a sane premium band, don't undercut too aggressively
    if 24.90 <= old_price <= cap:
        target = max(target, min(old_price * 0.45, cap))  # keep some premium memory without €300+

    price = nice_eur(target)
    price = min(max(price, floor), cap)
    return round(price, 2)


def finish_phrase(finish: str) -> str:
    """Phrase finish for short copy without doubling 'med' or forcing 'yta'."""
    # Compound: "guldfärgad med lila detaljer" → keep as-is (joined with comma upstream)
    if " med " in finish:
        return finish
    return f"med {finish} yta"


def material_sentence(material: str, category: str, sku: str) -> str:
    """Phrase material safely — never 'Tillverkad i detaljer/plätering only'."""
    m = material.strip()
    low = m.lower()
    has_base = any(k in low for k in ("stål", "titan", "koppar", "legering", "textil", "elastik"))
    ett = category in {"Halsband", "Armband", "Smyckesset"}
    plural = category == "Örhängen"
    tillverkad = "Tillverkade" if plural else ("Tillverkat" if ett else "Tillverkad")

    if low.startswith("detaljer"):
        return hpick(sku, [
            f"Enligt leverantören har smycket {m}.",
            f"Produktinformationen anger {m}.",
            f"Detaljerna beskrivs som {m}.",
        ])
    if has_base:
        return hpick(sku, [
            f"Material enligt leverantören: {m}.",
            f"Utförande i {m}, enligt tillgänglig produktinformation.",
            f"{tillverkad} i {m} (enligt leverantörsuppgifter).",
        ])
    # Plating / accents only — no "Tillverkad i guldpläterad yta"
    return hpick(sku, [
        f"Yta och detaljer enligt leverantören: {m}.",
        f"Produktinformationen anger {m}.",
        f"Enligt leverantörsuppgifter: {m}.",
    ])


def type_word_lower(category: str) -> str:
    return {
        "Halsband": "halsband",
        "Armband": "armband",
        "Ringar": "ring",
        "Örhängen": "örhängen",
        "Fotlänkar": "fotlänk",
        "Handkedjor": "handkedja",
        "Smyckesset": "smyckesset",
        "Håraccessoarer": "håraccessoar",
    }.get(category, "smycke")


def noun_phrase(category: str, name: str) -> str:
    core = design_core(name)
    # "Beige pärlscrunchie" already complete
    if category == "Håraccessoarer" and "scrunchie" in core.lower():
        return core[0].lower() + core[1:] if core else "scrunchie"
    if core.lower().startswith("tiara"):
        c = core[0].lower() + core[1:]
        # "tiara – stjärngeometri" → "tiaran med stjärngeometri" (definite for flowing copy)
        if " – " in c:
            left, right = c.split(" – ", 1)
            return f"tiaran med {right.strip()}"
        return "tiaran"
    return core[0].lower() + core[1:] if core else category.lower()


def build_short(row: dict) -> str:
    sku = row["SKU"]
    cat = primary_category(row["Categories"])
    name = row["Name"]
    core = design_core(name)
    finish = finish_from_name(name)
    material = material_from_row(row)

    openings = {
        "Halsband": [
            "Ett halsband som ger looken en mjuk men tydlig finish",
            "Ett smycke för nyckelbenet med ett lugnt, elegant uttryck",
            "Ett halsband med närvaro – enkelt att bära och lätt att älska",
        ],
        "Armband": [
            "Ett armband med fin detaljrikedom runt handleden",
            "Ett elegant armband som lyfter både jeans och klänning",
            "Ett armband med tydlig karaktär utan att ta över",
        ],
        "Ringar": [
            "En ring med personlighet – fin som statement eller i stack",
            "En elegant ring som ger handen en mjuk glans",
            "En ring med tydlig formkänsla för vardag och fest",
        ],
        "Örhängen": [
            "Ett par örhängen som sätter en elegant punkt på stylingen",
            "Örhängen med närvaro – lätta att matcha till flera looks",
            "Ett par örhängen som ger ansiktet en fin, genomtänkt finish",
        ],
        "Fotlänkar": [
            "En fotlänk som ger sommaren och öppna skor en elegant touch",
            "En fin detalj runt fotleden – lekfull men fortfarande sofistikerad",
        ],
        "Handkedjor": [
            "En handkedja som förbinder handled och finger i ett sammanhållet uttryck",
            "En elegant handkedja för dig som vill ha något utöver det vanliga",
        ],
        "Smyckesset": [
            "Ett matchande set som gör det enkelt att skapa en enhetlig look",
            "Ett smyckesset där delarna samspelar – redo direkt ur ask",
        ],
        "Håraccessoarer": [
            "En håraccessoar som lyfter frisyren med en elegant detalj",
            "En fin finish för uppsatt hår, vardagslook eller fest",
            "En accessoar som ger frisyren en mer påkostad känsla",
            "En diskret lyxig detalj för uppsatt hår",
        ],
    }

    open_ = hpick(sku, openings.get(cat, ["Ett smycke med elegant uttryck"]))

    # Design mention
    design_bits = []
    if "med " in core.lower():
        design_bits.append(core)
    elif core.lower().startswith("tiara"):
        design_bits.append(core)
    elif "scrunchie" in core.lower():
        design_bits.append(core)

    sentence1 = open_ + "."
    if design_bits:
        # Soften if opening already long
        d = design_bits[0]
        # Always lowercase product-type start for "Modellen är …"
        d_form = d[0].lower() + d[1:] if d and d[0].isupper() else d
        extras = []
        if material and any(k in material.lower() for k in ("stål", "titan", "koppar", "legering")):
            base = material.split(" med ")[0].split(",")[0].strip()
            extras.append(f"i {base}")
        if finish:
            extras.append(finish_phrase(finish))
        # Compound finishes already contain "med" — join with comma, not space
        if len(extras) == 2 and finish and " med " in finish:
            extra = ", ".join(extras)
        else:
            extra = " ".join(extras)
        # Warm phrasing instead of robotic "Designen:" / "Modellen:"
        dl = d_form.lower()
        if dl.startswith("örhängen"):
            sentence2 = f"Modellen är {d_form}"
        elif dl.startswith("tiara"):
            # "tiara – stjärngeometri" → "en tiara med stjärngeometri"
            if " – " in d_form:
                left, right = d_form.split(" – ", 1)
                sentence2 = f"Modellen är en {left.strip()} med {right.strip()}"
            else:
                sentence2 = f"Modellen är en {d_form}"
        elif dl.startswith(("ring", "fotlänk", "handkedja")):
            sentence2 = f"Modellen är en {d_form}"
        elif dl.startswith(("smyckesset", "halsband", "armband")):
            sentence2 = f"Modellen är ett {d_form}"
        elif "scrunchie" in dl:
            sentence2 = f"Modellen är en {d_form}"
        else:
            sentence2 = f"Modellen är {d_form}"
        sentence2 = sentence2 + (f", {extra}." if extra else ".")
    else:
        bits = []
        if material and any(k in material.lower() for k in ("stål", "titan", "koppar", "legering")):
            base = material.split(" med ")[0].split(",")[0].strip()
            bits.append(f"i {base}")
        if finish:
            bits.append(finish_phrase(finish))
        if len(bits) == 2 and finish and " med " in finish:
            joined = ", ".join(bits)
        else:
            joined = " ".join(bits)
        sentence2 = ("Utförande " + joined + ".") if bits else ""

    short = f"{sentence1} {sentence2}".strip()
    short = re.sub(r"\s+", " ", short)
    if len(short) > 240:
        short = sentence1
    return short


def build_description(row: dict) -> str:
    sku = row["SKU"]
    cat = primary_category(row["Categories"])
    name = row["Name"]
    core = design_core(name)
    finish = finish_from_name(name)
    material = material_from_row(row)
    weight = row.get("Weight (kg)", "")

    # Varied paragraph structures
    style_id = int(hashlib.md5(sku.encode()).hexdigest()[:6], 16) % 4

    np = noun_phrase(cat, name)

    ett = cat in {"Halsband", "Armband", "Smyckesset"}
    plural = cat == "Örhängen"
    skapad = "skapat" if ett else ("skapade" if plural else "skapad")
    tankt = "är tänkta" if plural else "är tänkt"

    if style_id == 0:
        p1 = f"Möt {np} – ett smycke där detaljerna får tala."
    elif style_id == 1:
        p1 = f"{np[0].upper() + np[1:] if np else 'Smycket'} {tankt} för dig som vill ha något vackert utan att det känns överarbetat."
    elif style_id == 2:
        p1 = f"En genomtänkt silhuett med fokus på form och yta: {np}."
    else:
        p1 = f"Det här är {np}, {skapad} för att komplettera din stil både till vardags och till mer uppklädda tillfällen."

    # Design paragraph – keep motifs / dash design, vary wording
    core_l = core[0].lower() + core[1:] if core else "modellen"
    if " – " in name and "stjärngeometri" in name.lower():
        p_design = hpick(sku, [
            "Motivet är stjärngeometri – skarpa linjer som fångar ljuset i håret.",
            "Här är det stjärngeometrin som ger tiaran dess karaktär.",
            "En tiara med stjärngeometri för ett tydligt, elegant uttryck.",
        ])
    elif " – " in name and "oändlighetshjärta" in name.lower():
        p_design = hpick(sku, [
            "Motivet är oändlighetshjärtat – mjukt, romantiskt och lätt att känna igen.",
            "Här är det oändlighetshjärtat som ger tiaran dess karaktär.",
            "En tiara med oändlighetshjärta för ett mer romantiskt och personligt uttryck.",
        ])
    elif "med " in core.lower():
        motif = core_l
        prefix = type_word_lower(cat) + " med "
        if motif.startswith(prefix):
            motif_only = motif[len(prefix):]
            p_design = hpick(sku, [
                f"Blickfånget sitter i detaljerna – {motif_only}.",
                f"Formen är tydlig: {core_l}.",
                f"Här är det {motif_only} som ger smycket dess karaktär.",
                f"En modell med {motif_only}, i en stilren silhuett.",
            ])
        else:
            p_design = hpick(sku, [
                f"Blickfånget sitter i detaljerna – {core_l}.",
                f"Formen är tydlig: {core_l}.",
                f"Här är det {core_l} som ger smycket dess karaktär.",
            ])
    else:
        p_design = hpick(sku, [
            "Modellen har ett rent och elegant uttryck som är lätt att bära.",
            "Uttrycket är återhållsamt – mer glans än brus.",
            "En diskret lyxig känsla som fungerar i flera sammanhang.",
        ])

    if finish:
        p_design += f" Ytan är {finish}."

    paras = [p1, p_design]

    if material:
        paras.append(material_sentence(material, cat, sku))

    # Usage – natural Swedish, no "lagerat"
    usage = {
        "Halsband": [
            "Bärs fint ensamt mot huden, eller tillsammans med andra halsband för en lager-på-lager-look.",
            "Perfekt som vardagsfavorit och lika självklart till en mer uppklädd outfit.",
            "Lägg det nära nyckelbenet för en mjuk glans som syns utan att skrika.",
        ],
        "Armband": [
            "Fint ensamt runt handleden, eller tillsammans med andra armband i en mjuk stack.",
            "En detalj som fungerar lika bra till skjortärm som till bar hy.",
            "Lätt att matcha till både jeans och mer feminina looks.",
        ],
        "Ringar": [
            "Bär den ensam som en tydlig detalj, eller kombinera med smalare ringar.",
            "En ring som ger handen karaktär – vardag som kväll.",
            "Fin att stapla med andra ringar eller låta stå för sig själv.",
        ],
        "Örhängen": [
            "Ett par som ger ansiktet en elegant finish på sekunder.",
            "Lika självklara till uppsatt hår som till löst hår över axlarna.",
            "En snabb väg till en mer påkostad känsla i looken.",
        ],
        "Fotlänkar": [
            "En lekfull detalj till sandaler, loafers eller bara fötter i sommarvärmen.",
            "Bärs fint ensam runt fotleden när du vill ha något lätt och elegant.",
        ],
        "Handkedjor": [
            "En handkedja som binder ihop looken – synlig när du gestikulerar och håller i ett glas.",
            "För dig som vill ha ett smycke med tydlig närvaro kring handen.",
        ],
        "Smyckesset": [
            "Setet gör det enkelt: delarna hör ihop och skapar en sammanhållen look direkt.",
            "Perfekt när du vill matcha utan att behöva leta rätt bland lösa smycken.",
        ],
        "Håraccessoarer": [
            "Sätt upp håret, fäst accessoarerna och låt detaljen bli blickfånget.",
            "En fin touch till bröllop, fest eller en vardag då du vill känna dig lite extra.",
        ],
    }
    paras.append(hpick(sku, usage.get(cat, ["Ett smycke som enkelt kompletterar din stil."])))

    # Care – rotate wording, avoid identical close
    care = [
        "Tips: ta av smycket vid dusch, träning och när du använder parfym eller handkräm – så bevaras finishen längre.",
        "För längsta möjliga glans: undvik vatten, parfym och starka kemikalier mot ytan.",
        "Förvara gärna torrt och separat från andra smycken när det inte används.",
    ]
    paras.append(hpick(sku + "care", care))

    # Details list – NO customer-facing SKU
    details = []
    if weight:
        details.append(f"<li>Vikt: {weight} kg</li>")
    if material:
        details.append(f"<li>Material (enligt leverantör): {material}</li>")
    if finish:
        details.append(f"<li>Yta/finish: {finish}</li>")
    unit = "par" if cat == "Örhängen" else ("set" if cat == "Smyckesset" else "styck")
    details.append(f"<li>Säljs per {unit}</li>")

    html = "".join(f"<p>{p}</p>" for p in paras)
    html += "<ul>" + "".join(details) + "</ul>"
    # Safety: never expose SKU or invoice in public HTML
    assert "SKU:" not in html
    assert "EVFTACBC" not in html
    assert "Inköpspris" not in html
    return html


def main() -> None:
    rows = list(csv.DictReader(SRC.open(encoding="utf-8-sig")))
    assert len(rows) == 133

    out = []
    price_changes = []
    for r in rows:
        cat = primary_category(r["Categories"])
        # Preserve tiara design names exactly
        if r["SKU"] in ("EVFVQ6V9YXZ", "EVFVJ8K7ZNQ"):
            assert "stjärngeometri" in r["Name"] or "oändlighetshjärta" in r["Name"]

        cost = float(r.get("Meta: _cost_price") or 0)
        old_p = float(r["Regular price"])
        new_p = recalculate_price(cost, cat, old_p)
        if abs(new_p - old_p) >= 0.01:
            price_changes.append((r["SKU"], r["Name"][:40], old_p, new_p, cost, cat))

        short = build_short(r)
        # ban words
        assert "lagerat" not in short.lower()
        desc = build_description(r)
        assert "lagerat" not in desc.lower()
        assert "SKU:" not in desc

        new = dict(r)
        new["Short description"] = short
        new["Description"] = desc
        new["Regular price"] = f"{new_p:.2f}"
        new["Categories"] = cat  # single category only
        # Keep tags without forcing dual cat; light cleanup
        tags = [t.strip() for t in (r.get("Tags") or "").split(",") if t.strip()]
        # ensure category tag
        if cat.lower() not in [t.lower() for t in tags]:
            tags.insert(0, cat.lower())
        new["Tags"] = ",".join(dict.fromkeys(tags))
        # Reinforced stock/publish rules
        new["Published"] = 0
        new["Visibility in catalog"] = "visible"
        new["In stock?"] = 1
        new["Stock"] = 1
        new["Backorders allowed?"] = 0
        new["Sold individually?"] = 0
        new["Images"] = ""
        new["Meta: _manage_stock"] = "yes"
        new["Meta: _stock"] = "1"
        new["Meta: _stock_status"] = "instock"
        new["Meta: _backorders"] = "no"
        new["Meta: _sold_individually"] = "no"
        # Preserve cost & identity
        new["Meta: _cost_price"] = r.get("Meta: _cost_price", "")
        new["Meta: _supplier_sku"] = r["SKU"]
        new["Meta: _invoice"] = r.get("Meta: _invoice", "EVFTACBC9WHT2")
        new["SKU"] = r["SKU"]
        new["Name"] = r["Name"]  # keep names (incl. tiara motifs & dash design)
        out.append(new)

    fieldnames = list(out[0].keys())
    with OUT.open("w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(out)

    # Report
    prices = [float(r["Regular price"]) for r in out]
    costs = [float(r["Meta: _cost_price"]) for r in out]
    margins = [((p - (c / SEK_PER_EUR)) / p * 100) for p, c in zip(prices, costs)]
    lines = []
    lines.append("ECO JEWELRY – Premiumgranskning")
    lines.append("=" * 60)
    lines.append(f"Källa: {SRC.name}")
    lines.append(f"Ny fil: {OUT.name}")
    lines.append(f"Antal produkter: {len(out)} (unik SKU: {len({r['SKU'] for r in out})})")
    lines.append("")
    lines.append("Beskrivningar:")
    lines.append("  - Samtliga short + long omskrivna till mer naturlig svenska")
    lines.append("  - Ordet 'lagerat' borttaget; lager-på-lager-look där relevant")
    lines.append("  - SKU/faktura/inköpspris syns inte i publik Description")
    lines.append("  - Tiara EVFVQ6V9YXZ / EVFVJ8K7ZNQ behåller stjärngeometri / oändlighetshjärta i namn")
    lines.append("")
    lines.append("Kategorier:")
    lines.append("  - Endast en primär kategori per produkt (dubbla kategorier borttagna)")
    for k, v in sorted(Counter(r["Categories"] for r in out).items(), key=lambda x: -x[1]):
        lines.append(f"    {k}: {v}")
    lines.append("")
    lines.append("Priser (EUR, ej konverterade till SEK):")
    lines.append(f"  Intervall: €{min(prices):.2f} – €{max(prices):.2f}")
    lines.append(f"  Snitt: €{sum(prices)/len(prices):.2f}")
    lines.append(f"  Ändrade priser: {len(price_changes)} av 133")
    lines.append(f"  Uppskattad bruttomarginal vs EUR-kostnad (SEK/11): snitt {sum(margins)/len(margins):.0f}%")
    lines.append("  Princip: sänkta omotiverat höga priser (set/handkedja/örhängen),")
    lines.append("  behållen premiumkänsla, golv som skyddar marginal efter avgifter.")
    lines.append("")
    lines.append("Största prissänkningar:")
    price_changes.sort(key=lambda x: x[2] - x[3], reverse=True)
    for sku, name, old, new, cost, cat in price_changes[:15]:
        lines.append(f"  {sku}: €{old:.0f} → €{new:.2f} (inköp {cost:.2f} kr) | {name} | {cat}")
    lines.append("")
    lines.append("Lager/publicering: Stock=1, manage stock=yes, backorders=no, Published=0, Images tom")
    lines.append("Valuta: numeriska priser avsedda för WooCommerce i EUR (ingen SEK-konvertering av siffror).")
    lines.append("")
    lines.append("OBS om inköpspris: Meta:_cost_price kommer från fakturan i SEK (kr).")
    lines.append("Prissättningen antar butik i EUR och räknar ungefärlig EUR-kostnad som SEK/11.")

    REPORT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    ARTIFACT_OUT.write_bytes(OUT.read_bytes())
    ARTIFACT_REPORT.write_text(REPORT.read_text(encoding="utf-8"), encoding="utf-8")

    print(f"Wrote {OUT}")
    print(f"Wrote {REPORT}")
    print(f"Price range €{min(prices):.2f}-{max(prices):.2f}, changed {len(price_changes)}")
    print("Top cuts:")
    for row in price_changes[:8]:
        print(" ", row)


if __name__ == "__main__":
    main()
