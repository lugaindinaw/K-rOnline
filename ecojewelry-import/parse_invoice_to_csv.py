#!/usr/bin/env python3
"""Parse Everful invoice PDF text into WooCommerce product CSV."""

from __future__ import annotations

import csv
import re
from pathlib import Path

from build_products import (
    attr_category,
    infer_material,
    retail_from_cost,
    unit_label,
)

ROOT = Path(__file__).parent
RAW = ROOT / "invoice_raw.txt"
OUT = ROOT / "woocommerce-produkter.csv"
SUMMARY = ROOT / "prislista-oversikt.csv"

PRICE_LADDER_NOTE = "≈10× inköp, samma stege som ecojewelry.se"


def classify_category(title: str) -> tuple[str, str]:
    """Return (shop category, unit) from English supplier title."""
    t = title.lower()
    if (
        "jewelry set" in t
        or "jewellery set" in t
        or "combination" in t
        or ("necklace" in t and "earring" in t)
    ):
        return "Smyckeset", "set"
    if "hair" in t or "scrunchie" in t or "tiara" in t or "crown" in t or "hairpin" in t or "hairstick" in t:
        return "Håraccessoarer", "st"
    if "anklet" in t or "ankle" in t or "foot chain" in t:
        return "Fotlänkar", "st"
    if "earring" in t or "stud" in t and "ring" not in t.split()[0:3]:
        return "Örhängen", "par"
    # stud earrings often say Stud Earrings
    if "earring" in t:
        return "Örhängen", "par"
    if "ring" in t and "earring" not in t and "necklace" not in t and "bracelet" not in t:
        return "Ringar", "st"
    if "bracelet" in t or "bangle" in t or "hand chain" in t or "anklet" not in t and "bracelet" in t:
        return "Armband", "st"
    if "necklace" in t or "choker" in t or "pendant" in t and "bracelet" not in t:
        return "Halsband", "st"
    if "bracelet" in t or "bangle" in t or "hand chain" in t:
        return "Armband", "st"
    return "Accessoarer", "st"


def swedish_short_name(title: str, category: str) -> str:
    """Compact Swedish-ish display name from English title + category."""
    # Keep first meaningful chunk of title, trimmed
    clean = re.sub(r"\s+", " ", title).strip()
    # Prefer short category-led names for storefront consistency
    prefixes = {
        "Örhängen": "Örhängen",
        "Ringar": "Ring",
        "Armband": "Armband",
        "Halsband": "Halsband",
        "Smyckeset": "Smyckeset",
        "Fotlänkar": "Fotlänk",
        "Håraccessoarer": "Håraccessoar",
        "Accessoarer": "Accessoar",
    }
    prefix = prefixes.get(category, "Smycke")
    # Take distinctive keywords from title (skip generic fillers)
    drop = {
        "for", "women", "men", "and", "with", "the", "a", "of", "in", "to",
        "fashion", "jewelry", "jewellery", "gift", "accessory", "accessories",
        "elegant", "luxury", "minimalist", "vintage", "niche", "style", "daily",
        "party", "light", "girls", "women's",
    }
    words = [w for w in re.findall(r"[A-Za-z0-9'&-]+", clean) if w.lower() not in drop]
    hint = " ".join(words[:8])
    name = f"{prefix} – {hint}" if hint else prefix
    return name[:120]


def variant_label(meta: dict) -> str:
    parts = []
    for key in ("Item Style", "Color", "Size", "Specification"):
        if meta.get(key):
            parts.append(meta[key])
    return ", ".join(parts) if parts else "Standard"


def parse_items(text: str) -> list[dict]:
    # Cut footer totals if present
    text = re.split(r"(?m)^Thank you for shopping", text)[0]
    # Split on numbered items at line starts: "1. Title..."
    chunks = re.split(r"(?m)^(\d+)\.\s+", text)
    # chunks: [preamble, num, body, num, body, ...]
    items = []
    for i in range(1, len(chunks), 2):
        num = int(chunks[i])
        body = chunks[i + 1]
        # PDF extraction sometimes injects order totals into the last item body
        body = re.split(
            r"(?:Total Cost|Origin Subtotal|Product Quantity|Shipping Fee|Order Discount|Shipping Discount|\bBalance\b)",
            body,
            maxsplit=1,
        )[0]

        # SKU
        sku_m = re.search(r"SKU:\s*([A-Z0-9]+)", body)
        if not sku_m:
            continue
        sku = sku_m.group(1)

        # Weight
        weight_m = re.search(r"Weight:\s*([0-9.]+)\s*kg", body, re.I)
        weight = float(weight_m.group(1)) if weight_m else 0.01

        # Title = text before first meta key / Weight / SKU
        title_part = re.split(
            r"(?=\n(?:Color|Item Style|Size|Specification|Weight|SKU|Free Shipping):)",
            body,
            maxsplit=1,
        )[0]
        # Also handle meta without newline after title (same line rare)
        title = re.sub(r"\s+", " ", title_part).strip()
        # Remove trailing meta fragments if split failed
        title = re.split(r"\b(?:Color|Item Style|Size|Specification|Weight|SKU):", title)[0].strip()
        title = title.rstrip(" ,")

        # Meta fields (stop at next key even when wrapped on same visual line)
        meta = {}
        for key in ("Item Style", "Color", "Size", "Specification"):
            m = re.search(
                rf"{key}:\s*(.+?)(?=(?:,)?(?:Color|Item Style|Size|Specification|Weight|SKU|Free Shipping):|$)",
                body,
                re.S,
            )
            if m:
                meta[key] = re.sub(r"\s+", " ", m.group(1)).strip(" ,")

        # Prices after Free Shipping / at end of item:
        #   kr 18.1 1 kr 15.98
        #   kr 12.56\nkr 8.91 1 kr 7.87   (list + paid unit + line total)
        #   kr 16.82 2 kr 29.70           (qty 2)
        norm = body.replace("\xa0", " ")
        price_m = re.search(
            r"(?:Free Shipping\s*)?(?:kr\s*[0-9.,]+\s*)*?kr\s*([0-9.,]+)\s+(\d+)\s+kr\s*([0-9.,]+)\s*$",
            norm,
            re.S,
        )
        if price_m:
            unit_paid = float(price_m.group(1).replace(",", ""))
            qty = int(price_m.group(2))
            line_total = float(price_m.group(3).replace(",", ""))
            cost = round(line_total / qty, 2) if qty else unit_paid
        else:
            money = re.findall(r"kr\s*([0-9][0-9,]*(?:\.[0-9]+)?)", norm)
            amounts = [float(x.replace(",", "")) for x in money]
            qty = 1
            if len(amounts) >= 2:
                cost = amounts[-2]
            elif amounts:
                cost = amounts[0]
            else:
                cost = 0.0

        category, unit = classify_category(title)
        low_title = title.lower()
        is_set = (
            "jewelry set" in low_title
            or "jewellery set" in low_title
            or "combination" in low_title
            or ("necklace" in low_title and "earring" in low_title and "ring" in low_title)
            or ("necklace" in low_title and "earring" in low_title)
        )
        # Only force earring category when the item is primarily earrings (not a set)
        if "earring" in low_title and not is_set and "necklace" not in low_title and "bracelet" not in low_title:
            category, unit = "Örhängen", "par"
        if "anklet" in low_title or "ankle bracelet" in low_title:
            category, unit = "Fotlänkar", "st"
        if (
            re.search(r"\bring\b", low_title)
            and "earring" not in low_title
            and "necklace" not in low_title
            and "bracelet" not in low_title
            and "hand chain" not in low_title
            and not is_set
        ):
            category, unit = "Ringar", "st"
        if is_set:
            category, unit = "Smyckeset", "set"

        items.append({
            "num": num,
            "sku": sku,
            "title": title,
            "meta": meta,
            "weight": weight,
            "cost": cost,
            "qty": qty,
            "category": category,
            "unit": unit,
        })
    return items


def build_rows(items: list[dict]) -> list[dict]:
    rows = []
    for it in items:
        style = variant_label(it["meta"])
        parent = swedish_short_name(it["title"], it["category"])
        # Prefer English style in name for uniqueness
        name = f"{parent} – {style}"
        if len(name) > 140:
            name = f"{style} | {parent}"[:140]

        material = infer_material(it["title"] + " " + parent, style, it["category"])
        price = retail_from_cost(it["cost"])
        short = f"{style}. Material: {material}. Säljs per {unit_label(it['unit'])}."
        # Description is public storefront HTML — never put wholesale cost or invoice ids here.
        # Cost/invoice stay in Meta columns + prislista-oversikt.csv (admin-only after import).
        description = (
            f"<p><strong>{it['title']}</strong></p>"
            f"<p>Variant: {style}</p>"
            f"<ul>"
            f"<li>SKU: {it['sku']}</li>"
            f"<li>Material: {material}</li>"
            f"<li>Vikt: {it['weight']} kg</li>"
            f"<li>Enhet: {unit_label(it['unit'])}</li>"
            f"</ul>"
            f"<p>Modeaccessoar – undvik vatten, parfym och kemikalier för längre hållbarhet.</p>"
        )
        cats = f"{it['category']}, {attr_category(it['title'] + ' ' + parent, style, it['category'], it['unit'])}"
        tags = ",".join(
            t for t in [
                it["category"].lower(),
                "everful",
                "nyheter",
                "guld" if "gold" in (style + it["title"]).lower() or "guld" in (style + it["title"]).lower() else "",
                "silver" if "silver" in (style + it["title"]).lower() else "",
            ] if t
        )

        rows.append({
            "Type": "simple",
            "SKU": it["sku"],
            "Name": name,
            "Published": 1,
            "Is featured?": 0,
            "Visibility in catalog": "visible",
            "Short description": short,
            "Description": description,
            "Tax status": "taxable",
            "In stock?": 1,
            "Stock": max(it["qty"], 1) * 5,  # initial stock = ordered qty × 5 buffer, min 5
            "Backorders allowed?": 0,
            "Weight (kg)": it["weight"],
            "Regular price": price,
            "Categories": cats,
            "Tags": tags,
            "Images": "",
            "Meta: _cost_price": f"{it['cost']:.2f}",
            "Meta: _supplier_sku": it["sku"],
            "Meta: _invoice": "EVFTACBC9WHT2",
        })
    return rows


def main() -> None:
    text = RAW.read_text(encoding="utf-8")
    items = parse_items(text)
    # Deduplicate by SKU (keep first) — qty 2 still one product
    seen = set()
    unique = []
    for it in items:
        if it["sku"] in seen:
            # merge qty into existing
            for u in unique:
                if u["sku"] == it["sku"]:
                    u["qty"] += it["qty"]
                    break
            continue
        seen.add(it["sku"])
        unique.append(it)

    rows = build_rows(unique)
    fieldnames = list(rows[0].keys())
    with OUT.open("w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(rows)

    with SUMMARY.open("w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(
            f,
            fieldnames=["#", "SKU", "Name", "Inköp (kr)", "Butikspris (kr)", "Marginal %", "Kategori", "Antal på faktura"],
        )
        w.writeheader()
        for it, r in zip(unique, rows):
            cost = it["cost"]
            price = int(r["Regular price"])
            margin = round((price - cost) / price * 100, 1) if price else 0
            w.writerow({
                "#": it["num"],
                "SKU": it["sku"],
                "Name": r["Name"][:90],
                "Inköp (kr)": f"{cost:.2f}",
                "Butikspris (kr)": price,
                "Marginal %": margin,
                "Kategori": r["Categories"],
                "Antal på faktura": it["qty"],
            })

    from collections import Counter
    print(f"Parsed {len(items)} invoice lines -> {len(unique)} unique SKUs")
    print(f"Wrote {OUT}")
    print(f"Wrote {SUMMARY}")
    print("Categories:", dict(Counter(i["category"] for i in unique)))
    costs = [i["cost"] for i in unique]
    print(f"Cost range: {min(costs):.2f}–{max(costs):.2f} kr")
    prices = [int(r["Regular price"]) for r in rows]
    print(f"Retail range: {min(prices)}–{max(prices)} kr")
    missing = [i["num"] for i in unique if i["cost"] <= 0 or not i["title"]]
    if missing:
        print("WARN incomplete:", missing)


if __name__ == "__main__":
    main()
