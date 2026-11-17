# Importera produkter till ecojewelry.se

## Källa
Faktura **EVFTACBC9WHT2** (Everful) → `parse_invoice_to_csv.py`

## Filer
- `woocommerce-produkter.csv` — 133 produkter redo för WooCommerce
- `prislista-oversikt.csv` — inköp vs butikspris (kontrollista)
- `parse_invoice_to_csv.py` — bygg CSV från fakturatext
- `build_products.py` — hjälprutiner (prisstege, material, kategorier)

## Prissättning
Inköpspriserna du skickade är leverantörspriser (ca 2–42 kr).
Butikspriserna är satta till **ca 10× inköp**, avrundat till samma prisnivå som dina befintliga produkter (45–389 kr).

Ändra priser i Excel innan import om du vill ha annan marginal.

## Bilder
Kolumnen `Images` är tom. Lägg till bild-URL:er (https://...) eller ladda upp bilder efter import under varje produkt.

## Import i WordPress (ca 2 min)
1. Logga in på WordPress-admin
2. Gå till **Produkter → Importera**
3. Välj `woocommerce-produkter.csv`
4. Bocka i **Continue** / mappa kolumner (WooCommerce känner igen standardnamnen)
5. Kör importen
6. Kontrollera 2–3 produkter (pris, kategori, SKU)

## Om du vill att jag lägger in dem åt dig
Skapa en **Application Password** i WordPress:
1. Användare → Din profil → Application Passwords
2. Namn: `cursor-import`
3. Skicka användarnamn + application password (inte ditt vanliga lösenord)

Då kan jag pusha produkterna via WooCommerce REST API.