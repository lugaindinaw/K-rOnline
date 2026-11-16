#!/usr/bin/env python3
"""Build final professional WooCommerce CSV for ECO JEWELRY (133 products)."""

from __future__ import annotations

import csv
import re
from collections import Counter
from pathlib import Path

from parse_invoice_to_csv import parse_items, variant_label

ROOT = Path(__file__).parent
SOURCE_CSV = ROOT / "woocommerce-produkter.csv"
OUT_CSV = ROOT / "ECO_JEWELRY_133_PRODUKTER_SLUTGILTIG.csv"
OUT_REPORT = ROOT / "ECO_JEWELRY_133_KVALITETSRAPPORT.txt"
ARTIFACT_CSV = Path("/opt/cursor/artifacts/ECO_JEWELRY_133_PRODUKTER_SLUTGILTIG.csv")
ARTIFACT_REPORT = Path("/opt/cursor/artifacts/ECO_JEWELRY_133_KVALITETSRAPPORT.txt")

# Motif keywords → Swedish (only used when present in source text)
MOTIFS = [
    ("clover", "klöver"),
    ("four leaf", "fyrklöver"),
    ("butterflies", "fjärilar"),
    ("butterfly", "fjäril"),
    ("heart", "hjärta"),
    ("star", "stjärna"),
    ("flower", "blomma"),
    ("floral", "blomster"),
    ("rose", "ros"),
    ("daisy", "tusensköna"),
    ("sunflower", "solros"),
    ("snake", "orm"),
    ("serpent", "orm"),
    ("dragon", "drake"),
    ("dolphin", "delfin"),
    ("elephant", "elefant"),
    ("moon", "måne"),
    ("sun", "sol"),
    ("cross", "kors"),
    ("infinity", "oändlighetssymbol"),
    (r"\bbow\b", "rosett"),  # avoid matching "box"
    ("pearl", "pärla"),
    ("zirconia", "zirkonia"),
    ("zircon", "zirkon"),
    ("rhinestone", "strass"),
    ("crystal", "kristall"),
    ("cuban", "cuban link"),
    ("herringbone", "fiskbenskedja"),
    ("rope chain", "repkedja"),
    ("satellite", "satellitkedja"),
    ("gypsophila", "gypsophila"),
    ("coin", "mynt"),
    ("shell", "snäcka"),
    ("starfish", "sjöstjärna"),
    ("cherry", "körsbär"),
    ("leopard", "leopard"),
    ("panther", "panter"),
    ("letter d", "bokstav D"),
    ("reindeer", "renhorn"),
    ("elk antler", "älghorn"),
    ("antler", "älghorn"),
    (r"\belk\b", "älghorn"),
    (r"\btiara\b", "tiara"),
    (r"\bcrown\b", "krona"),
    ("scrunchie", "scrunchie"),
    ("hoop", "creoler"),
    (r"\bstud\b", "stift"),
    ("tassel", "tofs"),
    ("lockbone", "nyckelbenslinje"),
    ("clavicle", "nyckelbenslinje"),
    ("open ring", "öppen form"),
    ("double layer", "dubbellager"),
    ("layered", "lagerad"),
    ("frosted", "frostad"),
    ("twisted", "tvinnad"),
    ("beaded", "pärlad"),
    ("rainbow", "regnbåge"),
]


def extract_motifs(text: str, limit: int = 2) -> list[str]:
    low = text.lower()
    found: list[str] = []
    for en, sv in MOTIFS:
        if en.startswith(r"\b") or en.endswith(r"\b"):
            hit = bool(re.search(en, low))
        else:
            hit = en in low
        if hit and sv not in found:
            found.append(sv)
        if len(found) >= 8:
            break
    drop = set()
    if "fyrklöver" in found and "klöver" in found:
        drop.add("klöver")
    if "blomma" in found and "blomster" in found:
        drop.add("blomster")
    if "zirkonia" in found and "zirkon" in found:
        drop.add("zirkon")
    if "fjärilar" in found and "fjäril" in found:
        drop.add("fjärilar")
    if "älghorn" in found and "horn" in found:
        drop.add("horn")
    if "tiara" in found and "krona" in found:
        drop.add("krona")
    # Don't use product-type words as motifs inside the same product name
    found = [m for m in found if m not in drop]
    soft = {"zirkon", "zirkonia", "strass", "kristall", "pärla", "stift", "nyckelbenslinje", "scrunchie", "tiara", "creoler"}
    design = [m for m in found if m not in soft]
    materialish = [m for m in found if m in soft]
    return (design + materialish)[:limit]


def style_swedish_hint(style: str) -> str | None:
    """Map distinctive English Color/Item Style labels to short Swedish design cues."""
    s = style.lower()
    mapping = [
        ("clover studs", "klöverstift"),
        ("cat's eye", "kattöga"),
        ("cat’s eye", "kattöga"),
        ("entwined pearl", "tvinnad pärla"),
        ("ear jacket", "ear jacket"),
        ("butterfly earrings", "fjäril"),
        ("pearl bow", "pärlrosett"),
        ("circle pearl", "cirkelpärla"),
        ("lace edge", "spetskant"),
        ("3d flower", "3D-blomma"),
        ("hoop earrings", "creoler"),
        ("ear clip", "örclips"),
        ("bow studs", "rosettstift"),
        ("sunflower", "solros"),
        ("serpent head", "ormhuvud"),
        ("leopard", "leopard"),
        ("panther", "panter"),
        ("d-letter", "bokstav D"),
        ("letter d", "bokstav D"),
        ("moon & star", "måne och stjärna"),
        ("3 butterflies", "tre fjärilar"),
        ("herringbone", "fiskbenskedja"),
        ("satellite chain", "satellitkedja"),
        ("gypsophila", "gypsophila"),
        ("double ball", "dubbelkula"),
        ("antler", "horn"),
        ("matte/smooth double ball", "matt/blank dubbelkula"),
        ("red wave", "röd våg"),
        ("beaded spliced hoop", "pärlad creol"),
        ("pea artificial pearl", "ärtformad pärla"),
        ("petal chain", "kronbladskedja"),
        ("moon heart", "måne och hjärta"),
        ("square charm", "fyrkantigt berlock"),
        ("snake ball", "ormkulor"),
        ("coin bracelet", "myntberlocker"),
        ("seven daisies", "sju tusenskönor"),
        ("sodalite", "sodalit"),
        ("amber gemstone set", "amberfärgat set"),
        ("floral jewelry set", "blomsterset"),
        ("water drop", "droppform"),
        ("infinity heart", "oändlighetshjärta"),
        ("star geometric", "stjärngeometri"),
        ("beige pearl scrunchie", "beige pärlscrunchie"),
        ("pink crystal pearl scrunchie", "rosa kristallscrunchie"),
        ("champagne crystal pearl scrunchie", "champagne scrunchie"),
    ]
    for en, sv in mapping:
        if en in s:
            return sv
    return None


def verified_material(title: str, style: str) -> str | None:
    """Only materials explicitly supported by supplier title/style wording."""
    low = f"{title} {style}".lower()
    parts = []
    if "stainless" in low or "rostfri" in low:
        parts.append("rostfritt stål")
    if "titanium" in low or "titan" in low:
        parts.append("titanstål")
    if "copper" in low or "koppar" in low:
        parts.append("koppar")
    if "alloy" in low:
        parts.append("legering")
    if "925" in low and "silver" in low and "earring post" in low:
        # Only the post is claimed as 925 — mention carefully
        parts.append("örhängesstift i 925-silver (enligt leverantör)")
    # Plating / tone — never claim solid gold or real silver from color alone
    if (
        "18k gold plated" in low
        or ("18k gold" in low and "plated" in low)
        or "gold plated" in low
        or ("electroplated" in low and "gold" in low)
    ):
        parts.append("guldpläterad yta")
    elif "14k gold plated" in low:
        parts.append("14K guldpläterad yta")
    elif re.search(r"\bgold\b", style.lower()) or "guld" in style.lower():
        parts.append("guldfärgad finish")
    # Silver finish only from variant color — not from "Gold Silver Plated" parent slogans
    if re.search(r"\bsilver\b", style.lower()) and not re.search(r"\bgold\b", style.lower()):
        parts.append("silverfärgad finish")
    elif "silver plated" in low and "gold" not in low:
        parts.append("silverpläterad yta")

    accents = []
    if "zirconia" in low or "cubic zirconia" in low:
        accents.append("zirkonia")
    elif re.search(r"\bzircon\b", low):
        accents.append("zirkon")
    if "rhinestone" in low:
        accents.append("strass")
    if "crystal" in low and "zircon" not in low:
        accents.append("kristalldetaljer")
    if "artificial pearl" in low or ("imitation" in low and "pearl" in low) or ("faux" in low and "pearl" in low):
        accents.append("imitationpärlor")
    elif "pearl" in low:
        accents.append("pärldetaljer (enligt leverantör)")

    bases = list(dict.fromkeys(parts))
    accents = list(dict.fromkeys(accents))
    if bases and accents:
        return f"{', '.join(bases)} med {', '.join(accents)}"
    if bases:
        return ", ".join(bases)
    if accents:
        return f"detaljer i {', '.join(accents)}"
    return None


def finish_label(style: str, title: str) -> str | None:
    s = style.lower()
    t = title.lower()
    if re.search(r"\bsilver\b", s) and not re.search(r"\bgold\b", s):
        return "silverfärgad"
    if re.search(r"\bgold\b", s) or "guld" in s:
        if "multicolor" in s or "colourful" in s or "colorful" in s or "rainbow" in s:
            return "guldfärgad med färgade detaljer"
        if "blue" in s:
            return "guldfärgad med blå detaljer"
        if "pink" in s:
            return "guldfärgad med rosa detaljer"
        if "purple" in s:
            return "guldfärgad med lila detaljer"
        if "red" in s:
            return "guldfärgad med röda detaljer"
        if "green" in s:
            return "guldfärgad med gröna detaljer"
        if "champagne" in s or "amber" in s:
            return "guldfärgad med champagne/amber-toner"
        return "guldfärgad"
    if "rainbow" in s or "rainbow" in t:
        return "färgglad gradient"
    if "platinum" in s:
        return "platinaton"
    if "multicolor" in s or "colorful" in s or "colourful" in s:
        return "flerfärgad"
    return None


def classify(title: str, style: str) -> tuple[str, str]:
    """Primary category + unit label for copy."""
    t = title.lower()
    s = style.lower()

    variant_is_set = bool(
        re.search(r"\bset\b", s)
        or re.search(r"\d+\s*-?\s*piece", s)
        or re.search(r"\bbracelet\s+(?:and|&)\s+ring\b|\bring\s+(?:and|&)\s+bracelet\b", s)
        or re.search(r"\bnecklace\s+(?:and|&)\s+bracelet\b|\bbracelet\s+(?:and|&)\s+necklace\b", s)
    )
    parent_is_set = (
        "jewelry set" in t
        or "jewellery set" in t
        or "combination" in t
        or ("necklace" in t and "earring" in t and "ring" in t)
    )

    if variant_is_set or (parent_is_set and re.search(r"\bset\b", s)):
        return "Smyckesset", "set"
    # Single piece from set line
    if re.search(r"\bbracelet\b", s) or re.search(r"\bbangle\b", s):
        if "hand chain" in t or "finger" in s and "bracelet" in s or "ring bracelet" in s or "finger bracelet" in s:
            return "Handkedjor", "st"
        return "Armband", "st"
    if "hand chain" in t or ("finger ring bracelet" in t) or ("hand back chain" in t):
        return "Handkedjor", "st"
    if re.search(r"\bnecklace\b", s) or re.search(r"\bchoker\b", s):
        return "Halsband", "st"
    if re.search(r"\bearrings?\b", s) or re.search(r"\bstuds?\b", s):
        return "Örhängen", "par"
    if re.search(r"\bring\b", s) and "earring" not in s and "bracelet" not in s:
        return "Ringar", "st"
    if re.search(r"\banklet\b", s):
        return "Fotlänkar", "st"

    if parent_is_set or ("necklace" in t and "earring" in t):
        return "Smyckesset", "set"
    if any(k in t for k in ("scrunchie", "hair ties", "hair stick", "hairstick", "tiara", "headband", "hairpin")) or (
        "hair" in t and "chain" not in t
    ):
        return "Håraccessoarer", "st"
    if "anklet" in t or "foot chain" in t or "ankle" in t:
        return "Fotlänkar", "st"
    if "hand chain" in t or "hand back chain" in t:
        return "Handkedjor", "st"
    if "bracelet" in t or "bangle" in t:
        return "Armband", "st"
    if "earring" in t:
        return "Örhängen", "par"
    if re.search(r"\bring\b", t) and "earring" not in t and "necklace" not in t:
        return "Ringar", "st"
    if "necklace" in t or "choker" in t or ("pendant" in t and "bracelet" not in t):
        return "Halsband", "st"
    return "Accessoarer", "st"


def secondary_cat(category: str, style: str, title: str) -> str:
    if category == "Håraccessoarer":
        return "Håraccessoarer"
    if category == "Smyckesset":
        return "Full set"
    finish = finish_label(style, title)
    if finish and "silver" in finish:
        return "Silver"
    return "Pläterad guld18k"


def type_word(category: str) -> str:
    return {
        "Halsband": "Halsband",
        "Armband": "Armband",
        "Ringar": "Ring",
        "Örhängen": "Örhängen",
        "Fotlänkar": "Fotlänk",
        "Handkedjor": "Handkedja",
        "Smyckesset": "Smyckesset",
        "Håraccessoarer": "Håraccessoar",
        "Accessoarer": "Accessoar",
    }.get(category, "Smycke")


def clean_style_hint(style: str) -> str:
    """Short Swedish-friendly hint from style without dumping codes."""
    s = re.sub(r"\([^)]*\)", "", style)
    s = re.sub(r"\b[A-Z]{1,3}-?\d+[A-Z0-9-]*\b", "", s)
    s = re.sub(r"\b\d+#\b", "", s)
    s = re.sub(r"\s+", " ", s).strip(" ,;-")
    # Drop pure color words for name building when too thin
    return s[:60]


def article_for(category: str) -> str:
    # Swedish grammatical gender for product nouns
    ett = {"Halsband", "Armband", "Smyckesset"}
    return "ett" if category in ett else "en"


def elegant_prefix(category: str) -> str:
    return "Eleganta" if category == "Örhängen" else "Elegant"


def demonstrative(category: str) -> str:
    return "Detta" if category in {"Halsband", "Armband", "Smyckesset"} else "Denna"


def build_name(category: str, title: str, style: str) -> str:
    tw = type_word(category)
    finish = finish_label(style, title)
    hint = style_swedish_hint(style)
    # Prefer style motifs; only use title motifs if style is thin (e.g. just "Gold")
    style_motifs = extract_motifs(style, limit=2)
    title_motifs = extract_motifs(title, limit=2)
    def overlaps(a: str, b: str) -> bool:
        a, b = a.lower(), b.lower()
        if a in b or b in a:
            return True
        aw = a.replace("-", " ").split()
        bw = b.replace("-", " ").split()
        for x in aw:
            for y in bw:
                if x in y or y in x:
                    return True
                if len(x) >= 4 and len(y) >= 4 and x[:4] == y[:4]:
                    return True
        return False

    if hint:
        motifs = [hint]
        # If hint is already a compound ("måne och stjärna"), keep it alone
        if " och " not in hint:
            for m in style_motifs + title_motifs:
                if any(overlaps(m, h) for h in motifs):
                    continue
                motifs.append(m)
                break
    elif style_motifs:
        motifs = style_motifs
    else:
        motifs = title_motifs[:2]

    if category == "Håraccessoarer":
        if "scrunchie" in f"{title} {style}".lower():
            tw = "Scrunchie"
        elif "tiara" in f"{title} {style}".lower() or "crown headband" in title.lower():
            tw = "Tiara"

    # Drop motifs that repeat the product type word or nest the type inside the hint
    motifs = [m for m in motifs if m.lower() not in {tw.lower(), "scrunchie", "tiara", "handkedja"}]
    if tw == "Scrunchie" and hint and "scrunchie" in hint.lower():
        # "beige pärlscrunchie" is already a complete name cue
        name = hint[0].upper() + hint[1:]
        motifs = []
    elif tw == "Tiara" and hint:
        name = f"Tiara – {hint}"
        motifs = []
    elif motifs:
        # Avoid "X med Yset" / "med set"
        motifs = [m for m in motifs if not m.endswith("set") and m != "set"]
        cleaned = []
        for m in motifs:
            if any(overlaps(m, c) for c in cleaned):
                continue
            cleaned.append(m)
        motifs = cleaned[:2]
        name = f"{tw} med {' och '.join(motifs)}" if motifs else tw
    else:
        low = f"{title} {style}".lower()
        if "open" in low and category == "Ringar":
            name = "Öppen ring"
        elif "bangle" in low:
            name = "Bangle-armband"
        elif category == "Handkedjor":
            name = "Handkedja"
        elif "round bead" in low or "bead pendant" in low:
            name = f"{tw} med kulhänge"
        else:
            name = tw

    # Fix accidental double construction when Scrunchie/Tiara already set name
    if "name" not in dir() or not name:
        name = tw

    if finish:
        if "silver" in finish:
            name += " – silverfärg"
        elif "platinaton" in finish:
            name += " – platinaton"
        elif "färgglad" in finish or "flerfärg" in finish:
            name += " – färgglad"
        elif "rosa" in finish:
            name += " – guldfärg med rosa detalj"
        elif "lila" in finish:
            name += " – guldfärg med lila detalj"
        elif "blå" in finish:
            name += " – guldfärg med blå detalj"
        elif "champagne" in finish:
            name += " – guldfärg med champagne"
        else:
            name += " – guldfärg"

    if len(name) > 72:
        name = name[:69] + "…"
    return name


def usage_line(category: str) -> str:
    return {
        "Halsband": "Ett smidigt smycke att bära ensamt eller lagerat med andra kedjor.",
        "Armband": "Passar både till vardag och mer uppklädda tillfällen.",
        "Ringar": "En detaljrik ring som enkelt kompletterar övriga smycken.",
        "Örhängen": "Ett par örhängen som ger en tydlig men elegant finish till looken.",
        "Fotlänkar": "En somrig detalj för fotleden, fin till öppna skor och strandlook.",
        "Handkedjor": "En handkedja som förbinder handled och finger i ett sammanhållet uttryck.",
        "Smyckesset": "Ett matchande set som ger en enhetlig look utan att behöva matcha plagg för plagg.",
        "Håraccessoarer": "En accessoar som lyfter frisyren vid vardag, fest eller högtid.",
        "Accessoarer": "En accessoar som enkelt kompletterar din smyckesstil.",
    }.get(category, "En accessoar som kompletterar din stil.")


def build_short(category: str, title: str, style: str, material: str | None) -> str:
    tw = type_word(category).lower()
    if category == "Håraccessoarer" and "scrunchie" in f"{title} {style}".lower():
        tw = "scrunchie"
    # Reuse same naming motifs as product name for consistency
    finish = finish_label(style, title)
    name_like = build_name(category, title, style)
    # Derive short lead from name without finish suffix
    lead = name_like.split(" – ")[0]
    # Avoid "Elegant Beige pärlscrunchie med beige..."
    if category == "Håraccessoarer" and "scrunchie" in lead.lower():
        sentence = f"{elegant_prefix(category)} {lead.lower()}."
        sentence = sentence[0].upper() + sentence[1:]
    else:
        tw = type_word(category).lower()
        if lead.lower().startswith(tw):
            rest = lead[len(type_word(category)):].strip()
            sentence = f"{elegant_prefix(category)} {tw}{(' ' + rest) if rest else ''}."
        else:
            sentence = f"{elegant_prefix(category)} {lead[0].lower() + lead[1:]}."
    # Material snippet
    base_mat = None
    if material:
        base_mat = material.split(" med ")[0].split(",")[0].strip()
    if base_mat and not base_mat.startswith("detaljer") and base_mat not in sentence:
        sentence = sentence[:-1] + f" i {base_mat}."
    second = usage_line(category)
    short = f"{sentence} {second}"
    if len(short) > 220:
        short = sentence
    return short.strip()


def build_description(
    category: str,
    title: str,
    style: str,
    material: str | None,
    weight: float,
    sku: str,
    unit: str,
) -> str:
    tw = type_word(category)
    motifs = extract_motifs(f"{title} {style}", limit=3)
    finish = finish_label(style, title)
    style_clean = clean_style_hint(style)

    demo = demonstrative(category)
    noun = tw.lower()
    if category == "Håraccessoarer" and "scrunchie" in f"{title} {style}".lower():
        noun = "scrunchie"
        demo = "Denna"

    if motifs:
        if len(motifs) == 1:
            motif_phrase = motifs[0]
        else:
            motif_phrase = f"{motifs[0]} och {motifs[1]}"
        p1 = f"{demo} {noun} har ett uttryck med {motif_phrase}."
    else:
        p1 = f"{demo} {noun} har en tydlig och elegant form."

    if finish:
        p1 += f" Finishen är {finish}."

    paras = [p1]

    if material:
        if material.startswith("detaljer"):
            paras.append(f"Enligt leverantörsinformationen har smycket {material}.")
        else:
            paras.append(f"Enligt leverantörsinformationen är materialet {material}.")

    # Mention distinctive variant only when it adds Swedish-useful design info
    if style_clean and len(style_clean) > 12:
        low_s = style_clean.lower()
        if low_s not in ("gold", "silver") and not re.fullmatch(r"gold|silver|platinum", low_s):
            # Translate a few frequent fragments; otherwise skip English dump
            sv_variant = None
            if "2-piece set" in low_s or "2-piece" in low_s:
                sv_variant = "set i två delar"
            elif "bracelet and ring set" in low_s:
                sv_variant = "set med armband och ring"
            elif "scrunchie" in low_s:
                sv_variant = style_clean
            if sv_variant:
                paras.append(f"Varianten: {sv_variant}.")

    paras.append(usage_line(category))
    paras.append(
        "Modeaccessoar: undvik kontakt med vatten, parfym och starka kemikalier för att bevara finishen."
    )

    unit_sv = {"st": "styck", "par": "par", "set": "set"}.get(unit, unit)
    details = [
        f"<li>SKU: {sku}</li>",
        f"<li>Enhet: {unit_sv}</li>",
    ]
    if weight:
        details.append(f"<li>Vikt: {weight} kg</li>")
    if material:
        details.append(f"<li>Material (enligt leverantör): {material}</li>")
    if finish:
        details.append(f"<li>Finish: {finish}</li>")

    html = "".join(f"<p>{p}</p>" for p in paras)
    html += "<ul>" + "".join(details) + "</ul>"
    return html


def load_prices() -> dict[str, dict]:
    rows = list(csv.DictReader(SOURCE_CSV.open(encoding="utf-8-sig")))
    return {r["SKU"]: r for r in rows}


def main() -> None:
    invoice_text = (ROOT / "invoice_raw.txt").read_text(encoding="utf-8")
    items = parse_items(invoice_text)
    # unique by SKU preserving first
    by_sku: dict[str, dict] = {}
    for it in items:
        by_sku.setdefault(it["sku"], it)

    prices = load_prices()
    assert len(by_sku) == 133, f"Expected 133 invoice SKUs, got {len(by_sku)}"
    assert len(prices) == 133, f"Expected 133 price SKUs, got {len(prices)}"
    missing_price = sorted(set(by_sku) - set(prices))
    missing_inv = sorted(set(prices) - set(by_sku))
    assert not missing_price and not missing_inv, (missing_price, missing_inv)

    out_rows = []
    uncertain = []
    name_counter: Counter[str] = Counter()

    for sku, it in sorted(by_sku.items(), key=lambda x: x[1]["num"]):
        src = prices[sku]
        title = it["title"]
        style = variant_label(it["meta"])
        category, unit = classify(title, style)
        material = verified_material(title, style)
        if not material:
            uncertain.append(f"{sku}: material ej verifierbart i titel/variant – utelämnat i beskrivning")

        name = build_name(category, title, style)
        name_counter[name] += 1
        if name_counter[name] > 1:
            # Swedish disambiguation from style motifs / finish detail — never dump English codes
            extra = extract_motifs(style, limit=1)
            if extra and extra[0] not in name:
                name = f"{name.replace(' – ', f' med {extra[0]} – ', 1)}" if " – " in name else f"{name} med {extra[0]}"
            else:
                detail = finish_label(style, title) or "variant"
                # Use short numeric style cue if present
                code = re.search(r"\(([A-Z0-9-]{3,})\)", style) or re.search(r"(\d+#)", style)
                suffix = code.group(1) if code else f"modell {name_counter[name]}"
                name = f"{name} ({suffix})"

        short = build_short(category, title, style, material)
        # Fix short description construction edge cases
        short = re.sub(r"\s+", " ", short).strip()
        short = re.sub(r"Elegant (\w+) \1", r"Elegant \1", short, flags=re.I)

        desc = build_description(category, title, style, material, float(it["weight"]), sku, unit)
        sec = secondary_cat(category, style, title)
        cats = f"{category}, {sec}"

        # Keep price exactly from source CSV
        regular = src["Regular price"]
        sale = src.get("Sale price", "") if "Sale price" in src else ""

        row = {
            "Type": "simple",
            "SKU": sku,
            "Name": name,
            "Published": 0,
            "Is featured?": 0,
            "Visibility in catalog": "visible",
            "Short description": short,
            "Description": desc,
            "Tax status": "taxable",
            "In stock?": 1,
            "Stock": 1,
            "Backorders allowed?": 0,
            "Sold individually?": 0,
            "Weight (kg)": it["weight"] if it["weight"] else src.get("Weight (kg)", ""),
            "Regular price": regular,
            "Sale price": sale,
            "Categories": cats,
            "Tags": ",".join(
                t
                for t in [
                    category.lower(),
                    "eco jewelry",
                    "nyheter",
                    "guld" if sec == "Pläterad guld18k" else "",
                    "silver" if sec == "Silver" else "",
                ]
                if t
            ),
            "Images": "",
            "Meta: _manage_stock": "yes",
            "Meta: _stock": "1",
            "Meta: _stock_status": "instock",
            "Meta: _backorders": "no",
            "Meta: _sold_individually": "no",
            "Meta: _cost_price": src.get("Meta: _cost_price", ""),
            "Meta: _supplier_sku": sku,
            "Meta: _invoice": "EVFTACBC9WHT2",
        }
        out_rows.append(row)

    # Second pass: ensure unique names fully (Swedish-friendly suffix)
    seen_names: dict[str, int] = {}
    for row in out_rows:
        n = row["Name"]
        if n in seen_names:
            seen_names[n] += 1
            row["Name"] = f"{n} – variant {seen_names[n]}"
        else:
            seen_names[n] = 1

    fieldnames = list(out_rows[0].keys())
    with OUT_CSV.open("w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(out_rows)

    # Quality checks
    skus = [r["SKU"] for r in out_rows]
    issues = []
    if len(skus) != 133:
        issues.append(f"Fel antal produkter: {len(skus)}")
    if len(set(skus)) != 133:
        issues.append("Dubblett-SKU hittades")
    for r in out_rows:
        if r["Published"] != 0 and r["Published"] != "0":
            issues.append(f"{r['SKU']}: Published != 0")
        if str(r["Stock"]) != "1":
            issues.append(f"{r['SKU']}: Stock != 1")
        if str(r["Backorders allowed?"]) not in ("0", 0):
            issues.append(f"{r['SKU']}: backorders")
        if r["Images"]:
            issues.append(f"{r['SKU']}: images not empty")
        if not r["Short description"] or not r["Description"]:
            issues.append(f"{r['SKU']}: missing description")
        if not r["Name"]:
            issues.append(f"{r['SKU']}: missing name")
        if float(r["Regular price"]) != float(prices[r["SKU"]]["Regular price"]):
            issues.append(f"{r['SKU']}: price changed")
        # Forbidden invented claims
        bad = ("massivt guld", "äkta silver", "diamant", "vattentålig", "allergivänlig", "18k guld" )
        blob = (r["Description"] + r["Short description"]).lower()
        for b in bad:
            if b in blob and "pläter" not in blob[max(0, blob.find(b) - 20) : blob.find(b) + 40]:
                # allow 18k only with plätering nearby
                if b == "18k guld" and "pläter" in blob:
                    continue
                if b == "18k guld":
                    continue  # we use "guldpläterad" carefully
                issues.append(f"{r['SKU']}: suspicious claim '{b}'")

    # Price preservation summary
    price_ok = all(
        str(r["Regular price"]) == str(prices[r["SKU"]]["Regular price"]) for r in out_rows
    )

    cat_counts = Counter(r["Categories"].split(",")[0].strip() for r in out_rows)
    report = []
    report.append("ECO JEWELRY – Kvalitetsrapport")
    report.append("=" * 60)
    report.append("Källa: faktura EVFTACBC9WHT2 + woocommerce-produkter.csv")
    report.append(f"Antal produkter i slutfil: {len(out_rows)}")
    report.append(f"Unika SKU: {len(set(skus))}")
    report.append(f"SKU matchar faktura och käll-CSV: JA")
    report.append("")
    report.append("Lagerinställningar (alla rader):")
    report.append("  Manage stock: yes (Meta: _manage_stock)")
    report.append("  Stock quantity: 1")
    report.append("  In stock: 1")
    report.append("  Backorders: 0 / no")
    report.append("  Sold individually: 0")
    report.append("")
    report.append("Publicering (alla rader):")
    report.append("  Published: 0 (opublicerad/utkast)")
    report.append("  Visibility in catalog: visible")
    report.append("")
    report.append(f"Priser bevarade oförändrade från käll-CSV: {'JA' if price_ok else 'NEJ'}")
    report.append("Bilder: kolumn Images tom för alla 133 (inga bilder tillagda)")
    report.append("")
    report.append("Kategorifördelning:")
    for k, v in sorted(cat_counts.items(), key=lambda x: (-x[1], x[0])):
        report.append(f"  {k}: {v}")
    report.append("")
    report.append("Osäkra / utelämnade produktegenskaper:")
    if uncertain:
        for u in uncertain:
            report.append(f"  - {u}")
    else:
        report.append("  (inga – material kunde härledas för alla från titel/variant)")
    report.append("")
    report.append("Övriga anmärkningar:")
    report.append("  - Inga mått, allergivänlighet eller vattenbeständighet har lagts till.")
    report.append("  - 'Guld'/'Silver' i finish avser färg/plätering enligt leverantörstext, inte massiv ädelmetall.")
    report.append("  - Zirkon/zirkonia/strass beskrivs endast när ordet finns i källtext.")
    report.append("  - Meta:_cost_price bevarad för intern adminanvändning (syns inte i Description).")
    report.append("")
    report.append("Kvalitetskontrollfel:")
    if issues:
        for i in issues:
            report.append(f"  ! {i}")
    else:
        report.append("  Inga fel funna.")
    report.append("")
    report.append("Bearbetade SKU (alla 133):")
    for r in out_rows:
        report.append(f"  {r['SKU']} | {r['Name']} | {r['Categories'].split(',')[0]} | pris={r['Regular price']}")

    OUT_REPORT.write_text("\n".join(report) + "\n", encoding="utf-8")
    ARTIFACT_CSV.write_text(OUT_CSV.read_text(encoding="utf-8"), encoding="utf-8")
    ARTIFACT_REPORT.write_text(OUT_REPORT.read_text(encoding="utf-8"), encoding="utf-8")

    print(f"Wrote {OUT_CSV} ({len(out_rows)} rows)")
    print(f"Wrote {OUT_REPORT}")
    print("Categories:", dict(cat_counts))
    print("Issues:", len(issues))
    print("Uncertain materials:", len(uncertain))
    if issues:
        print("\n".join(issues[:20]))
        raise SystemExit(1)


if __name__ == "__main__":
    main()
