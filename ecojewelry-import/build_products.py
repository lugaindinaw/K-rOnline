#!/usr/bin/env python3
"""Build WooCommerce CSV for ecojewelry.se from supplier product list."""

import csv
from pathlib import Path

# Retail pricing: ~10x wholesale to match existing ecojewelry.se price band (≈45–500 kr)
PRICE_LADDER = [
    45, 56, 67, 78, 89, 100, 112, 123, 134, 145, 156, 167, 178, 189,
    200, 212, 223, 234, 245, 267, 278, 300, 311, 334, 356, 389, 445, 500, 556,
]


def retail_from_cost(cost: float) -> int:
    target = cost * 10
    best = PRICE_LADDER[0]
    for p in PRICE_LADDER:
        if abs(p - target) < abs(best - target):
            best = p
    # never price below ~8x for very cheap items
    if best < cost * 8:
        for p in PRICE_LADDER:
            if p >= cost * 8:
                return p
    return best


# Each row: parent_title, style/variant label, sku, cost_sek, unit, weight_kg, category, tags
PRODUCTS = [
    # Vintage Stainless Steel Earrings
    ("Vintage örhängen rostfritt stål – geometrisk hjärta/fjäril/blomma", "Beaded Spliced Hoop Earring (BJGE1233), Gold", "EVFV3ZNNMMN", 6.43, "par", 0.006, "Örhängen", "örhängen,guldpläterad,vintage"),
    # Stainless Steel Zirconia Rhombus Flower Bracelet
    ("Armband zirconia blomma – luxury clover bangle", "Blue Three-Row Drill Style (15#), Gold-Blue", "EVFVN7Z3XR2", 16.82, "st", 0.027, "Armband", "armband,zirconia,guld"),
    ("Armband zirconia blomma – luxury clover bangle", "Rectangular Buckle Row Style (49#), Gold", "EVFVR2RWX8Y", 22.06, "st", 0.027, "Armband", "armband,zirconia,guld"),
    ("Armband zirconia blomma – luxury clover bangle", "French Spliced Flower Geometric Style (88#), Silver-Multicolor", "EVFVVMPRVRP", 19.39, "st", 0.027, "Armband", "armband,zirconia,silver"),
    # Vintage 18K Gold Plated Adjustable Ring
    ("Vintage 18K guldpläterad justerbar ring – geometrisk open band", "42-Red Wave", "EVFV96KYWY2", 11.67, "st", 0.005, "Ringar", "ring,guldpläterad,justerbar"),
    # Luxurious 18K Gold Plated Copper Leaf Zirconia Open Ring
    ("18K guldpläterad open ring med zirconia", "Gold Heart Open Ring", "EVFV7MYW5NQ", 9.60, "st", 0.009, "Ringar", "ring,guldpläterad,zirconia"),
    ("18K guldpläterad open ring med zirconia", "Gold Y-Shape Open Ring", "EVFVQZE3PWZ", 9.10, "st", 0.009, "Ringar", "ring,guldpläterad,zirconia"),
    ("18K guldpläterad open ring med zirconia", "Cross Zirconia Open Ring", "EVFVRPW8NNY", 15.53, "st", 0.009, "Ringar", "ring,guldpläterad,zirconia"),
    # Heart Clover Pendant Necklace
    ("Halsband hjärta/klöver – pärla & rhinestone", "Pea Artificial Pearl Necklace (X179), Gold", "EVFVRP66VXY", 7.92, "st", 0.027, "Halsband", "halsband,pärla,guldpläterad"),
    ("Halsband hjärta/klöver – pärla & rhinestone", "Petal Chain Claw Rhinestone Necklace (X249), Gold", "EVFV9ZJJYX2", 9.40, "st", 0.027, "Halsband", "halsband,rhinestone,guldpläterad"),
    # Micro-set Zirconia Crystal Pendant Necklace
    ("Halsband zirconia hänge – light luxury", "Letter D Geometric Shape (XL1470-5)", "EVFV6W7WXJ5", 12.27, "st", 0.02, "Halsband", "halsband,zirconia,guld"),
    ("Halsband zirconia hänge – light luxury", "Dolphin Pendant (XL1407), Gold", "EVFV5EPEQYE", 12.27, "st", 0.02, "Halsband", "halsband,zirconia,guld"),
    ("Halsband zirconia hänge – light luxury", "Red Heart (XL1200-057), Gold", "EVFVVX8XWRP", 12.27, "st", 0.02, "Halsband", "halsband,hjärta,guld"),
    ("Halsband zirconia hänge – light luxury", "Purple Heart (XL1349), Gold", "EVFVRVMV3WY", 12.27, "st", 0.02, "Halsband", "halsband,hjärta,guld"),
    ("Halsband zirconia hänge – light luxury", "Radiating Sun Style (XL1470-105), Gold, 41–50 cm", "EVFVVX8XWZP", 11.77, "st", 0.02, "Halsband", "halsband,sol,guld"),
    ("Halsband zirconia hänge – light luxury", "Exquisite Butterfly Style (XL0752), Gold, 41–50 cm", "EVFVYQYQZW9", 11.08, "st", 0.02, "Halsband", "halsband,fjäril,guld"),
    ("Halsband zirconia hänge – light luxury", "Colorful Five-Petal Flower (XL2185-01)", "EVFVMM6EJNX", 12.27, "st", 0.034, "Halsband", "halsband,blomma"),
    ("Halsband zirconia hänge – light luxury", "Coiled Golden Snake (XL2605-025)", "EVFV9E67RX2", 11.77, "st", 0.034, "Halsband", "halsband,orm,guld"),
    ("Halsband zirconia hänge – light luxury", "Artificial Pearl Stand Pendant (XL2606-021)", "EVFVZ7QJ5R2", 12.27, "st", 0.034, "Halsband", "halsband,pärla"),
    ("Halsband zirconia hänge – light luxury", "Ruby Square Zircon (XL1200-159), Gold", "EVFVZ7QJ5W2", 12.27, "st", 0.014, "Halsband", "halsband,zirconia,guld"),
    # Luxury Titanium Steel Rhinestone Jewelry Combination (sets)
    ("Smyckeset titanstål – halsband/örhängen/ring", "Gold D-letter Pendant Style (365), Gold", "EVFV43XVRNG", 27.10, "set", 0.05, "Smyckeset", "set,guld,zirconia"),
    ("Smyckeset titanstål – halsband/örhängen/ring", "Serpent Head Full Drill Set (427), Gold", "EVFVGVZ9QEP", 29.57, "set", 0.02, "Smyckeset", "set,guld,orm"),
    ("Smyckeset titanstål – halsband/örhängen/ring", "Serpent Head Full Drill Set (427), Silver", "EVFV4WV39W7", 29.57, "set", 0.02, "Smyckeset", "set,silver,orm"),
    ("Smyckeset titanstål – halsband/örhängen/ring", "Rotating Sunflower Set (862), Gold", "EVFV4QQ92KZ", 29.57, "set", 0.017, "Smyckeset", "set,guld,solros"),
    ("Smyckeset titanstål – halsband/örhängen/ring", "Rotating Sunflower Set (862), Silver", "EVFVGXE83Z3", 29.57, "set", 0.017, "Smyckeset", "set,silver,solros"),
    # Copper Zirconia Artificial Pearl Open Ring
    ("Justerbar open ring i koppar – blomma/hjärta/fjäril/rosett", "Gold Bell Woven Style (G4127617), Adjustable", "EVFVE9E7KNJ", 19.68, "st", 0.014, "Ringar", "ring,justerbar,zirconia,koppar"),
    # Exquisite Stainless Steel Rhinestone Pendant Necklace And Earrings Set
    ("Smyckeset vintage palace – halsband & örhängen", "Amber Gemstone Set (23#), Gold-Champagne", "EVFVVMPRKWP", 25.62, "set", 0.04, "Smyckeset", "set,vintage,amber"),
    # Stainless Steel Ring With Zircon Heart And Screw Design
    ("Rostfri ring med zirconia – hjärta & skruvdesign", "Full Screw Style, Gold, US 8", "EVFV7R8E8NQ", 4.46, "st", 0.005, "Ringar", "ring,guld,unisex"),
    ("Rostfri ring med zirconia – hjärta & skruvdesign", "Full Screw Style, Silver, US 5", "EVFVNM72762", 3.66, "st", 0.005, "Ringar", "ring,silver,unisex"),
    ("Rostfri ring med zirconia – hjärta & skruvdesign", "Full Screw Style, Gold, US 6", "EVFVRQ272VY", 4.46, "st", 0.005, "Ringar", "ring,guld,unisex"),
    # Vintage Dragon Head Keel Bracelet
    ("Drakearmband punk/hiphop – dragon scale", "21 cm, Gold and Silver Two-tone", "EVFVG6EYXM5", 12.66, "st", 0.008, "Armband", "armband,drake,punk"),
    ("Drakearmband punk/hiphop – dragon scale", "21 cm, Antique Silver", "EVFVEEW8R9J", 11.18, "st", 0.032, "Armband", "armband,drake,silver"),
    # Titanium Steel Necklace 18K Gold Plated
    ("Halsband titanstål 18K guld – hjärta/fjäril/geometrisk", "Gold Matte/Smooth Double Ball (K315 Gold)", "EVFVG7K726Q", 13.75, "st", 0.012, "Halsband", "halsband,guldpläterad"),
    ("Halsband titanstål 18K guld – hjärta/fjäril/geometrisk", "Gold Antler V-Shape (K321 Gold)", "EVFVG9RYQ72", 11.18, "st", 0.012, "Halsband", "halsband,guldpläterad"),
    # Minimalist Stainless Steel Rhinestone Bangle
    ("Minimalistisk rhinestone bangle – clover/hjärta", "Gold Frosted Bangle (2005)", "EVFVPM37738", 25.82, "st", 0.04, "Armband", "armband,bangle,guld"),
    # Alloy Rhinestone Artificial Pearl Earrings
    ("Örhängen rhinestone & pärla – 925 silverstift", "Sparkling Zirconia Clover Studs - A687 Gold", "EVFVRQK2JNY", 3.66, "par", 0.005, "Örhängen", "örhängen,studs,guld"),
    ("Örhängen rhinestone & pärla – 925 silverstift", "Dainty Cat's Eye Studs - E4616 Gold", "EVFV3KMZP6N", 3.47, "par", 0.004, "Örhängen", "örhängen,studs,guld"),
    ("Örhängen rhinestone & pärla – 925 silverstift", "Versatile Entwined Pearl Earrings - A571 Gold", "EVFVKP29EV9", 3.66, "par", 0.007, "Örhängen", "örhängen,pärla,guld"),
    ("Örhängen rhinestone & pärla – 925 silverstift", "Retro Unique Personality Earrings - A1587 Gold", "EVFVRQK2JZY", 3.17, "par", 0.007, "Örhängen", "örhängen,retro,guld"),
    ("Örhängen rhinestone & pärla – 925 silverstift", "Versatile Sparkling Zircon Earrings - A1324 Silver", "EVFVJ32MV8Q", 3.66, "par", 0.005, "Örhängen", "örhängen,zirconia,silver"),
    ("Örhängen rhinestone & pärla – 925 silverstift", "Ear Jacket Pearl Earrings - A1583 Gold", "EVFVNMV7K82", 3.66, "par", 0.008, "Örhängen", "örhängen,pärla,guld"),
    ("Örhängen rhinestone & pärla – 925 silverstift", "Zircon Inlaid Butterfly Earrings - A803 Silver", "EVFVM68M5PX", 4.65, "par", 0.005, "Örhängen", "örhängen,fjäril,silver"),
    ("Örhängen rhinestone & pärla – 925 silverstift", "Sparkling Zircon Pearl Bow Earrings - A066 Gold", "EVFV5RMZ7ME", 3.66, "par", 0.008, "Örhängen", "örhängen,rosett,guld"),
    ("Örhängen rhinestone & pärla – 925 silverstift", "Retro Circle Pearl Earrings - A1085 Gold", "EVFVJ32MV2Q", 3.47, "par", 0.006, "Örhängen", "örhängen,pärla,guld"),
    ("Örhängen rhinestone & pärla – 925 silverstift", "French Retro Lace Edge Earrings - A2284 Silver", "EVFVQR5725Z", 6.43, "par", 0.008, "Örhängen", "örhängen,retro,silver"),
    ("Örhängen rhinestone & pärla – 925 silverstift", "Metal Cat's Eye 3D Flower Earrings - A2015 Gold", "EVFVZNZ3Y52", 3.96, "par", 0.008, "Örhängen", "örhängen,blomma,guld"),
    ("Örhängen rhinestone & pärla – 925 silverstift", "Simple Crush Silver Style Hoop Earrings - A2259 Gold", "EVFVWXKRWE7", 3.66, "par", 0.015, "Örhängen", "örhängen,hoop,guld"),
    ("Örhängen rhinestone & pärla – 925 silverstift", "Zirconia Butterfly Ear Clip - A2434 Gold Large", "EVFVMW92ZVX", 3.47, "par", 0.005, "Örhängen", "örhängen,clip,guld"),
    ("Örhängen rhinestone & pärla – 925 silverstift", "Ins-Style Full Zirconia Bow Studs - A2109 Silver", "EVFVWXKR3N7", 3.66, "par", 0.004, "Örhängen", "örhängen,studs,silver"),
    # Chic Stainless Steel Zirconia Mouse Head / Moon Heart Pendant
    ("Halsband zirconia måne/hjärta – lockbone chain", "Moon Heart Zirconia Style (XL2606-187)", "EVFVY6Z3VJ9", 17.41, "st", 0.016, "Halsband", "halsband,zirconia,guld"),
    # Elegant Bracelet Titanium Steel 18K Gold Plated Adjustable
    ("Lagerat armband titanstål 18K – hjärta/kors/emerald", "Textured Cross Link Gold", "EVFVPM8V6Q8", 6.14, "st", 0.005, "Armband", "armband,guldpläterad,justerbar"),
    # Stainless Steel Gold Plated Bracelet Adjustable Layered
    ("Justerbart lagerat armband – hjärta/klöver/zircon", "Square Charm Bracelet (QZSLE188), Gold", "EVFVNYNJ2E2", 8.11, "st", 0.01, "Armband", "armband,guld,charm"),
    ("Justerbart lagerat armband – hjärta/klöver/zircon", "Red Rhinestone Style (QZSLE2401), Gold", "EVFV3RQ5X3N", 7.62, "st", 0.027, "Armband", "armband,rhinestone,guld"),
    ("Justerbart lagerat armband – hjärta/klöver/zircon", "White Rhinestone Clover (QZSLE2539), Gold", "EVFVY6ZJEJ9", 10.39, "st", 0.027, "Armband", "armband,klöver,guld"),
    ("Justerbart lagerat armband – hjärta/klöver/zircon", "Triple Layer Round Snake Ball (QZSLE2542), Gold", "EVFV9ZXQ5Q2", 13.06, "st", 0.027, "Armband", "armband,lagerat,guld"),
    ("Justerbart lagerat armband – hjärta/klöver/zircon", "Three Round White Rhinestones (QZSLE2250), Gold", "EVFVZ6R3W32", 10.09, "st", 0.014, "Armband", "armband,rhinestone,guld"),
    # Titanium Steel Clover Heart Star Pendant Necklace
    ("Halsband klöver/hjärta/stjärna – koreansk stil", "Gold Charm Star (8491)", "EVFV56E3X8E", 13.06, "st", 0.021, "Halsband", "halsband,stjärna,guld"),
    ("Halsband klöver/hjärta/stjärna – koreansk stil", "Gold (8495)", "EVFV2E36R9R", 13.06, "st", 0.022, "Halsband", "halsband,guld"),
    ("Halsband klöver/hjärta/stjärna – koreansk stil", "Gold Clover (8502)", "EVFVPY3E9R8", 13.06, "st", 0.014, "Halsband", "halsband,klöver,guld"),
    ("Halsband klöver/hjärta/stjärna – koreansk stil", "Gold Hollow Clover (8493)", "EVFV9WYPJ32", 19.29, "st", 0.014, "Halsband", "halsband,klöver,guld"),
    ("Halsband klöver/hjärta/stjärna – koreansk stil", "Floral (8469), Silver", "EVFVMWP39EX", 12.37, "st", 0.022, "Halsband", "halsband,blomma,silver"),
    ("Halsband klöver/hjärta/stjärna – koreansk stil", "Gold Heart CD (8471)", "EVFV9WYPK72", 12.07, "st", 0.021, "Halsband", "halsband,hjärta,guld"),
    ("Halsband klöver/hjärta/stjärna – koreansk stil", "Gold Rose 1 (8504)", "EVFVEZWYRPJ", 11.87, "st", 0.022, "Halsband", "halsband,ros,guld"),
    ("Halsband klöver/hjärta/stjärna – koreansk stil", "Gold Shovel (8497)", "EVFVPY3E9P8", 13.55, "st", 0.022, "Halsband", "halsband,guld"),
    ("Halsband klöver/hjärta/stjärna – koreansk stil", "Silver Shovel (8497)", "EVFVMWP37RX", 13.55, "st", 0.022, "Halsband", "halsband,silver"),
    # Elegant Zirconia Drop Earrings
    ("Droppörhängen zirconia – 925 silverstift", "Gold White Style (Y26900)", "EVFV262W5VR", 35.71, "par", 0.008, "Örhängen", "örhängen,dropp,guld"),
    # Double Layer Anklet
    ("Dubbellager fotlänk – pärla/stjärna/snäcka", "Oval Zirconia Double Layer Style (B1703)", "EVFV4P28K78", 27.20, "st", 0.004, "Fotlänkar", "fotlänk,sommar,zirconia"),
    ("Dubbellager fotlänk – pärla/stjärna/snäcka", "Colorful Clover Zirconia Double Layer Style (B1702)", "EVFV42YWK8R", 27.20, "st", 0.005, "Fotlänkar", "fotlänk,klöver,zirconia"),
    # Double Layer Clover Flower Bracelet
    ("Dubbellager armband klöver/blomma med zirconia & pärla", "Flower Chain Style", "EVFVGX6YXE3", 35.21, "st", 0.004, "Armband", "armband,klöver,pärla"),
    # Minimalist Frosted Ring
    ("Minimalistisk frostad ring titanstål", "Size 4, Gold", "EVFVY7W3X29", 5.94, "st", 0.002, "Ringar", "ring,frostad,guld"),
    ("Minimalistisk frostad ring titanstål", "Size 5, Gold", "EVFVRR9ZNQY", 5.94, "st", 0.002, "Ringar", "ring,frostad,guld"),
    # Hand Chain Bracelet with Finger Ring
    ("Handkedja med ring – stjärna/hjärta/geometrisk", "Round Rhinestone Style", "EVFV3ZXKQQN", 41.44, "st", 0.014, "Armband", "handkedja,rhinestone,guld"),
    # Fashion Stainless Steel Bracelet Adjustable
    ("Justerbart armband – hjärta/klöver/fjäril", "Hollow Clover Star Gold", "EVFV2ZM3E9R", 16.03, "st", 0.013, "Armband", "armband,klöver,guld"),
    # Hand Chain Bracelet Rhinestone Flower
    ("Handkedja med blomring – bohemisk stil", "Triple Flower Pattern Style (NB-B1574)", "EVFV5ZXJM6E", 36.79, "st", 0.032, "Armband", "handkedja,blomma,bohemisk"),
    # Vintage Copper Zirconia Open Ring
    ("Vintage open ring koppar/zirconia – hjärta/solros", "Staggered Double Layer Center Zircon Style (JZ5893)", "EVFV36RV7QN", 13.45, "st", 0.004, "Ringar", "ring,justerbar,zirconia"),
    # 18K Gold Plated Round Bead Set pieces
    ("Minimalistiskt pärlhängesset – halsband/armband/örhängen", "Gold Necklace", "EVFV533R6KE", 17.61, "st", 0.033, "Halsband", "halsband,pärla,guld"),
    ("Minimalistiskt pärlhängesset – halsband/armband/örhängen", "Gold Earrings", "EVFVKVVP589", 10.09, "par", 0.009, "Örhängen", "örhängen,pärla,guld"),
    ("Minimalistiskt pärlhängesset – halsband/armband/örhängen", "Gold Bracelet", "EVFV8V6P63Q", 11.97, "st", 0.015, "Armband", "armband,pärla,guld"),
    # Cuban Link Chain Jewelry Set piece
    ("Cuban link set – bokstavshänge", "Letter Decoration (DM-1060), Gold Bracelet", "EVFV533RRQE", 20.18, "st", 0.018, "Armband", "armband,cuban,guld"),
    # Rainbow Zirconia Cuban Chain Bracelet
    ("Cuban chain armband med baguette-zirconia", "Gold-White Zirconia", "EVFVZ88J2P2", 20.18, "st", 0.027, "Armband", "armband,cuban,zirconia"),
    # Double Butterfly Pendant Necklace
    ("Dubbel fjärilshalsband – frostad minimalistisk", "Gold", "EVFVRZZQQWY", 12.17, "st", 0.01, "Halsband", "halsband,fjäril,guld"),
    # Three-Layer Rope Chain Bracelet
    ("Trelagers twisted rope chain armband", "Color Block", "EVFVZ88QQ52", 11.58, "st", 0.014, "Armband", "armband,twist,justerbar"),
    # Double Heart Open Ring
    ("Dubbelhjärta open ring – justerbar", "Gold", "EVFV9PP6WW2", 4.46, "st", 0.003, "Ringar", "ring,hjärta,guld"),
    ("Dubbelhjärta open ring – justerbar", "Silver", "EVFVX997PP3", 3.37, "st", 0.003, "Ringar", "ring,hjärta,silver"),
    # Double Layer Irregular Rhombus Necklace
    ("Dubbellager choker – rhombus/sequin", "Gold", "EVFVX72JPY3", 20.57, "st", 0.01, "Halsband", "halsband,choker,guld"),
    # Elk Antler Stud Earrings
    ("Älghorn örhängen – forest style", "Gold", "EVFV2ZMEE6R", 3.96, "par", 0.005, "Örhängen", "örhängen,älghorn,guld"),
    # Chinese Style Hair Stick
    ("Hårnål med pärla & blomma – hanfu-stil", "Lily of the Valley Artificial Pearl Hairstick", "EVFV96WJEW2", 8.51, "st", 0.022, "Håraccessoarer", "hårnål,pärla"),
    ("Hårnål med pärla & blomma – hanfu-stil", "Pink Plum Blossom", "EVFV8V65P3Q", 9.99, "st", 0.02, "Håraccessoarer", "hårnål,blomma"),
    # Bridal Tiara Crown Headband
    ("Brudtiara / krona – rhinestone & pärla", "Star Geometric Style (FG098)", "EVFVQ6V9YXZ", 13.45, "st", 0.018, "Håraccessoarer", "tiara,bröllop"),
    ("Brudtiara / krona – rhinestone & pärla", "Infinity Heart Style (FG005)", "EVFVJ8K7ZNQ", 13.45, "st", 0.018, "Håraccessoarer", "tiara,hjärta"),
    # Imitation Pearl Hair Ties
    ("Pärlscrunchie – hårband & armband i ett", "Beige Pearl Scrunchie", "EVFV42EM3JR", 2.48, "st", 0.008, "Håraccessoarer", "scrunchie,pärla"),
    ("Pärlscrunchie – hårband & armband i ett", "Champagne Crystal Pearl Scrunchie", "EVFVG9WVY82", 6.43, "st", 0.008, "Håraccessoarer", "scrunchie,kristall"),
    ("Pärlscrunchie – hårband & armband i ett", "Pink Crystal Pearl Scrunchie", "EVFVGXPRQ33", 6.43, "st", 0.008, "Håraccessoarer", "scrunchie,rosa"),
    # Luxury Colored Zircon Bracelet
    ("Färgad zirconia-armband – stackable", "Colorful", "EVFVKVQK8X9", 22.85, "st", 0.008, "Armband", "armband,zirconia,färgad"),
    # Zirconia Flower Star Cross Pendant Bracelet
    ("Armband med blomma/stjärna/kors-häng", "Gold Zirconia Flower (G4211257-t)", "EVFVEY8YMZJ", 15.53, "st", 0.008, "Armband", "armband,zirconia,guld"),
    # Punk Snake Pendant Necklace
    ("Ormhänge halsband i koppar – punk/gothic", "Gold", "EVFVRZPVR3Y", 9.89, "st", 0.006, "Halsband", "halsband,orm,guld,koppar"),
    ("Ormhänge halsband i koppar – punk/gothic", "Silver", "EVFV26Y3EQR", 9.89, "st", 0.006, "Halsband", "halsband,orm,silver,koppar"),
    # Elegant Zirconia Flower Star Heart Open Ring
    ("Open ring blomma/stjärna/hjärta med lila sten", "Gold Flower Drip Style (JZ3119A)", "EVFV9PZ8862", 12.47, "st", 0.005, "Ringar", "ring,zirconia,guld"),
    # Crown Zirconia Open Ring Purple Stone
    ("Kronring i koppar / twisted cross open ring med lila sten", "Purple Square Zircon Twisted Cross Style (JZ0202A), Adjustable", "EVFVM3K55WX", 11.97, "st", 0.005, "Ringar", "ring,krona,justerbar,koppar"),
    # Gold Plated Alloy Hand Chain Bracelet
    ("Handkedja med pärllänk och fingerring", "Gold", "EVFVZ8VNMV2", 11.28, "st", 0.008, "Armband", "handkedja,guld"),
    # Letter D Titanium Steel Bracelet
    ("Armband bokstav D – rhinestone chain", "Style (738), Gold", "EVFVYM2PPE9", 16.03, "st", 0.022, "Armband", "armband,bokstav,guld"),
    # Gold Plated Coin Bracelet Anklet
    ("Myntarmband / fotlänk – etnisk bohemisk", "5-Pendant Coin Bracelet", "EVFV7RJ59XQ", 25.62, "st", 0.01, "Armband", "armband,mynt,bohemisk"),
    # Four Leaf Clover Bracelet
    ("Fyrklöverarmband – hollow flower minimalist", "Gold Clover Style (P323 Gold)", "EVFVG6VVKX5", 9.99, "st", 0.003, "Armband", "armband,klöver,guld"),
    ("Fyrklöverarmband – hollow flower minimalist", "Silver Clover Style (P324 Steel)", "EVFV4ZWWMR2", 9.99, "st", 0.003, "Armband", "armband,klöver,silver"),
    # Alloy Rhinestone Snake Anklet
    ("Ormfotlänk – justerbar", "Gold", "EVFVZKQKX52", 17.81, "st", 0.016, "Fotlänkar", "fotlänk,orm,guld"),
    ("Ormfotlänk – justerbar", "Silver", "EVFV39K9WYN", 17.81, "st", 0.016, "Fotlänkar", "fotlänk,orm,silver"),
    # Necklace Earrings And Ring Jewelry Set
    ("Smyckeset halsband/örhängen/ring – zircon 18K", "Leopard Panther Style Full Drill Gold Tone Set (8873)", "EVFVVNXZ85P", 29.57, "set", 0.012, "Smyckeset", "set,leopard,guld"),
    ("Smyckeset halsband/örhängen/ring – zircon 18K", "Clover Star Full Drill Gold Tone Set (509)", "EVFVWJQVE37", 29.57, "set", 0.012, "Smyckeset", "set,klöver,guld"),
    # French Light Luxury Rhinestone Bracelet
    ("Franskt light luxury armband i koppar – crystal dangle", "Gold", "EVFVW65KXN7", 9.70, "st", 0.012, "Armband", "armband,kristall,guld,koppar"),
    # Stainless Steel Jewelry Heart Butterfly Cross Evil Eye pieces
    ("Pärlarmband / halsband – evil eye & gypsophila", "Dual Gold Bead Bracelet (E2259), Gold", "EVFVXQQKYV3", 6.04, "st", 0.034, "Armband", "armband,pärla,guld"),
    ("Pärlarmband / halsband – evil eye & gypsophila", "Gypsophila Clamped Bead Bracelet (E2180), Gold", "EVFVP33NQP8", 7.82, "st", 0.034, "Armband", "armband,gypsophila,guld"),
    ("Pärlarmband / halsband – evil eye & gypsophila", "Dual Gold Bead Necklace (H1322), Gold", "EVFV9YYXK52", 6.73, "st", 0.034, "Halsband", "halsband,pärla,guld"),
    # Sparkling Gypsophila Chain
    ("Gypsophila kedja – clavicle / dubbellager", "Satellite Chain, Gold", "EVFVGYXKX99", 8.41, "st", 0.009, "Halsband", "halsband,gypsophila,guld"),
    ("Gypsophila kedja – clavicle / dubbellager", "Gypsophila Double Layer Bracelet, Gold", "EVFVRQKY38Y", 4.95, "st", 0.005, "Armband", "armband,gypsophila,guld"),
]


def unit_label(unit: str) -> str:
    return {"par": "par", "st": "styck", "set": "set", "pc": "styck"}.get(unit, unit)


def infer_material(parent: str, style: str, category: str) -> str:
    """Infer a short Swedish material line from product text (not a generic metal claim)."""
    low = f"{parent} {style} {category}".lower()
    if any(k in low for k in ("scrunchie", "hair ties", "hårband", "elastic")):
        return "textil/elastik med imitationpärla eller kristall"
    if any(k in low for k in ("hair stick", "hårnål", "tiara", "crown", "krona", "headband")):
        return "legering med rhinestone/imitationpärla"
    if "copper" in low or "koppar" in low:
        return "koppar med plätering"
    if "alloy" in low or "legering" in low:
        return "legering med plätering"
    if "titanium" in low or "titan" in low:
        return "titanstål med plätering"
    if "stainless" in low or "rostfri" in low:  # matches rostfri / rostfritt
        return "rostfritt stål med plätering"
    if category == "Håraccessoarer":
        return "legering / textil (modeaccessoar)"
    return "pläterad modelegering (enligt leverantör)"


def attr_category(parent: str, style: str, category: str, unit: str) -> str:
    """Secondary shop category. Prefer metal/set/hair — never map imitation pearl to Naturliga pärlor."""
    if category == "Håraccessoarer":
        return "Håraccessoarer"
    if "set" in category.lower() or unit == "set":
        return "Full set"

    low = f"{parent} {style}".lower()
    has_silver = "silver" in low
    has_gold = "gold" in low or "guld" in low
    if has_silver and not has_gold:
        return "Silver"
    return "Pläterad guld18k"


def build_rows():
    rows = []
    for parent, style, sku, cost, unit, weight, category, tags in PRODUCTS:
        price = retail_from_cost(cost)
        name = f"{parent} – {style}"
        # keep name under ~120 chars for readability
        if len(name) > 140:
            name = f"{style} | {parent}"[:140]

        material = infer_material(parent, style, category)
        short = f"{style}. Material: {material}. Säljs per {unit_label(unit)}."
        description = (
            f"<p><strong>{parent}</strong></p>"
            f"<p>Variant: {style}</p>"
            f"<ul>"
            f"<li>SKU: {sku}</li>"
            f"<li>Material: {material}</li>"
            f"<li>Vikt: {weight} kg</li>"
            f"<li>Enhet: {unit_label(unit)}</li>"
            f"<li>Fri frakt inom butikens ordinarie villkor</li>"
            f"</ul>"
            f"<p>Modeaccessoar – undvik vatten, parfym och kemikalier för längre hållbarhet.</p>"
        )

        cats = f"{category}, {attr_category(parent, style, category, unit)}"

        rows.append({
            "Type": "simple",
            "SKU": sku,
            "Name": name,
            "Published": 1,
            "Is featured?": 0,
            "Visibility in catalog": "visible",
            "Short description": short,
            "Description": description,
            "Tax status": "taxable",
            "In stock?": 1,
            "Stock": 20,
            "Backorders allowed?": 0,
            "Weight (kg)": weight,
            "Regular price": price,
            "Categories": cats,
            "Tags": tags,
            "Images": "",
            "Meta: _cost_price": f"{cost:.2f}",
            "Meta: _supplier_sku": sku,
        })
    return rows


def main():
    out = Path(__file__).parent / "woocommerce-produkter.csv"
    rows = build_rows()
    fieldnames = list(rows[0].keys())
    with out.open("w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    # summary
    summary = Path(__file__).parent / "prislista-oversikt.csv"
    with summary.open("w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=["SKU", "Name", "Inköp (kr)", "Butikspris (kr)", "Marginal %", "Kategori"])
        w.writeheader()
        for r, src in zip(rows, PRODUCTS):
            cost = src[3]
            price = int(r["Regular price"])
            margin = round((price - cost) / price * 100, 1) if price else 0
            w.writerow({
                "SKU": r["SKU"],
                "Name": r["Name"][:80],
                "Inköp (kr)": f"{cost:.2f}",
                "Butikspris (kr)": price,
                "Marginal %": margin,
                "Kategori": r["Categories"],
            })

    print(f"Wrote {len(rows)} products -> {out}")
    print(f"Summary -> {summary}")
    prices = [int(r["Regular price"]) for r in rows]
    print(f"Price range: {min(prices)}–{max(prices)} kr")
    print(f"Avg price: {sum(prices)/len(prices):.0f} kr")


if __name__ == "__main__":
    main()
