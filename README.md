# KogniLab Room Viewer

Interaktywny viewer 3D dwóch wariantów aranżacji pomieszczeń KogniLabu 307 i 308. Aplikacja jest statyczna: po zbudowaniu nie wymaga backendu ani połączeń z zewnętrznymi CDN.

## Plan instalacji dla wykonawcy (02.11.2026)

Domyślny tryb „Instalacje” pokazuje nową propozycję 230 V, LAN/PoE, USB/DisplayPort i oświetlenia. Przycisk „Wyposażenie” przywraca przegląd mebli. Każdy punkt ma kod, wysokość, liczbę przyłączy i opis; wybór wyróżnia jego trasy od właściwego źródła. „Od switcha R0” pokazuje LAN z istniejącej szafki w 307. E0 oznacza proponowane wejście zasilania budynku, którego rzeczywiste doprowadzenie ustala elektryk.

Wspólna propozycja dla A/B: 34 pojedyncze gniazda 230 V, 13 łączy LAN, 6 proponowanych pozycji opraw. Górna trasa ma oś około 212 cm; przed skosami są zejścia do 100 cm, a przy tylnej ścianie do 85 cm. X2 jest krótkim przepustem aparatury na 100 cm. Są to założenia do uzgodnienia z wykonawcą.

- `assets/installation_plan.json`: graf tras, punkty i połączenia, wspólne z PDF. Edycję współrzędnych należy robić w `../scripts/create_installation_plan.py`, który zapisuje także źródłowy JSON w `../source/`.
- `installations.js`: nakładka Three.js, etykiety, filtrowanie i wyróżnienie połączeń. Na małym ekranie pokazuje najważniejsze etykiety; wszystkie punkty pozostają dostępne z listy.
- `assets/KogniLab_plan_instalacji.pdf`: 4 strony - zakres prac, rzuty A/B z tabelami, 3D i przekrój wysokości. Link „Plan PDF” pobiera tę samą wersję.
- Stare, niepełne przewody osadzone w GLB są ukryte. Nowe trasy są nakładką z JSON; nie przebudowywano plików FreeCAD/STEP/GLB.
- Udostępniony adres zachowuje również tryb instalacji i filtry systemów; PNG zawiera widoczne etykiety i trasy. Każda strona rewaliduje pliki danych, a warianty pozostają buforowane w trakcie sesji.

Regeneracja z katalogu projektu nadrzędnego:

```bash
python3 lab_room_model/scripts/create_installation_plan.py
python3 lab_room_model/scripts/validate_installations.py
uv run --with reportlab --with pillow --with pypdf python lab_room_model/scripts/render_installation_plan.py
```

PDF korzysta z eksportów PNG z przeglądarki w `../output/installations/view_3d_a.png` i `view_3d_b.png`. Po zmianie geometrii tras trzeba wyeksportować oba obrazy ponownie, następnie wygenerować PDF i wykonać build. Walidator sprawdza ciągłość, 13 połączeń LAN od R0, oddzielne źródło 230 V, położenie R0 w szafce A/B i wysokość kanałów pod skosami. Nie zastępuje projektu obwodów ani pomiaru na miejscu.

Weryfikacja nowego trybu: 31 sprawdzeń interakcji w Chromium (w tym wybór punktu na modelu, filtry, oba warianty, link, eksport i mobilny układ) oraz walidacja 1113 próbek wysokości tras. Skrypty i wyniki znajdują się w nadrzędnym `output/playwright/installations-*`.

## Stan i obsługa aplikacji

Viewer służy do przeglądania dwóch zaprojektowanych aranżacji. Wariant A łączy pracę, spotkania i VR, a wariant B zabudowę U z magazynem. Nie jest edytorem ustawienia mebli.

- Niezależny wybór pomieszczenia (całość / 307 / 308) i projekcji (3D / ortograficzny rzut 2D).
- Warstwy ścian, skosów, stref i przewodów. Rzut 2D chwilowo ukrywa skosy; powrót do 3D przywraca wcześniejsze ustawienie.
- Wyszukiwanie zespołów wyposażenia, również bez polskich znaków, w obrębie wybranego pokoju. Przeszukiwane są także opisy i nazwy elementów.
- Wybór z listy lub kliknięciem w model: obrys zaznaczenia, opis funkcji i wymiary z JSON. Przycisk „Przybliż w modelu” kadruje wybrany zespół.
- Zwijany panel na telefonie, obsługa dotyku, widoczny fokus i pomoc. Po wybraniu modelu strzałki przesuwają widok, `+` / `−` zmieniają przybliżenie, `0` przywraca kadr, a `Escape` usuwa zaznaczenie.
- „Kopiuj link” zapisuje w adresie wariant, pomieszczenie, projekcję, warstwy i zaznaczenie. Dokładny obrót i przybliżenie kamery oraz tekst wyszukiwania nie są zapisywane.
- „Zapisz PNG” pobiera bieżący kadr bez interfejsu, w rozdzielczości płótna. To podgląd modelu, nie zwymiarowany rysunek techniczny.
- Błąd pobierania nowego wariantu zachowuje poprzednią scenę i pozwala ponowić próbę. Brak WebGL ma osobny komunikat.

## Organizacja kodu

- `app.js`: stan interfejsu, adres URL, ładowanie wariantów, wyszukiwanie, opisy i eksport.
- `scene.js`: Three.js, kamery, kadrowanie, warstwy, wybieranie obiektów i renderowanie na żądanie.
- `index.html`, `styles.css`: dostępny interfejs i układ responsywny.
- `assets/`: gotowe modele GLB i opisy JSON; aplikacja nie zapisuje do tych plików.
- `scripts/build.mjs`: kopiuje aplikację i lokalne moduły Three.js do `dist/`. Build nadaje adresom JS/CSS wersję zależną od zawartości, a Nginx wymusza ponowną walidację modeli i modułów po aktualizacji. Nowy moduł aplikacji trzeba dodać również do `Dockerfile`.

Scena nie renderuje kolejnych klatek po ustaniu ruchu kamery. Oba warianty są pobierane i dekodowane przy pierwszym użyciu, a następnie przechowywane w pamięci do zamknięcia strony. Nie ma backendu, CDN ani dodatkowych zależności wykonawczych poza Three.js. Warstwy są rozpoznawane po prefiksach obiektów, a wyposażenie jest łączone z opisami przez identyfikatory z JSON; eksporty muszą zachować te nazwy.

## Co pozostaje poza zakresem

- Przesuwanie i obracanie mebli, tworzenie własnego wariantu, cofanie zmian i zapis edytowanej aranżacji.
- Interaktywne wymiarowanie, pełna kontrola kolizji mebel–mebel, otwierania drzwi oraz dostępu serwisowego.
- Porównanie wariantów obok siebie i wspólna praca wielu osób.
- Automatyczna synchronizacja z kosztorysem, zakupami i stanem wyposażenia.

W projekcie nadrzędnym źródłami geometrii są `../source/rooms.json`, `../source/equipment_layout.json` i `../source/equipment_layout_b.json`. Skrypty w `../scripts/` generują modele CAD/GLB oraz dokumentację PDF/SVG. Zmiana aranżacji nadal wymaga edycji tych źródeł i ponownego eksportu; samo edytowanie opisu JSON w `assets/` nie zmieni geometrii GLB.

Walidator projektu nadrzędnego sprawdza obrys pomieszczeń, kolizje ze skosem i strefą VR oraz przebieg przewodów względem VR. Nie jest pełnym silnikiem kontroli kolizji. Oba warianty przechodzą tę walidację z uwagą o 12 cm zapasu nad regałem. Do pomiaru pozostają grzejnik, wysokość korpusu szafy serwerowej i warunki wykonania przepustu 307–308.

## Sprawdzenie zmian UX (01.11.2026)

- Build statyczny i obraz Docker z Node.js 22; lokalny kontener po aktualizacji ma stan `healthy`, a `/healthz` zwraca `ok`.
- W Chromium: 39 sprawdzeń interfejsu i renderowania na działającym kontenerze, w tym ekran 1440 × 960, telefon 390 × 844, szerokość 320 px i widok poziomy 844 × 390. Bez nieobsłużonych błędów JavaScript.
- Dodatkowo: kliknięcia i przeciąganie w modelu, pomijanie ukrytych obiektów, schowek, utrata/przywrócenie WebGL; awarie HTTP, niepoprawny JSON, ponawianie pobierania i konkurujące zmiany wariantu.
- Potwierdzono brak kolejnych renderów w 500 ms bezczynności oraz brak ponownych pobrań już wczytanych wariantów.
- Walidacja geometrii A/B: 0 błędów, po jednej uwadze o zapasie nad regałem. Nie regenerowano CAD ani rysunków, ponieważ geometria nie była zmieniana.

Sprawdzenie mobilne wykorzystuje rozmiary ekranu w Chromium; nie zastępuje testu na fizycznym telefonie ani osobnej weryfikacji Safari i Firefox.

## Uruchomienie przez Docker

```bash
docker compose up --build
```

Viewer będzie dostępny pod adresem:

```text
http://localhost:8080
```

Inny port można ustawić zmienną środowiskową:

```bash
VIEWER_PORT=8765 docker compose up --build
```

Bez Compose:

```bash
docker build -t kognilab-room-viewer .
docker run --rm -p 8080:8080 kognilab-room-viewer
```

Endpoint kontroli działania:

```text
http://localhost:8080/healthz
```

## Lokalny build statyczny

Wymagany jest Node.js 22 lub nowszy.

```bash
npm ci
npm run build
python3 -m http.server 8080 --directory dist
```

Build zapisuje kompletną aplikację w `dist/`, w tym lokalną kopię wymaganych modułów Three.js.

## Publikowanie

Workflow `.github/workflows/publish-container.yml` publikuje wieloarchitekturowy obraz `linux/amd64` i `linux/arm64` do:

```text
ghcr.io/OWNER/REPOSITORY:latest
```

Po pierwszym wypchnięciu gałęzi `main` obraz można uruchomić:

```bash
docker run --rm -p 8080:8080 ghcr.io/OWNER/REPOSITORY:latest
```

Tag Git, na przykład `v1.0.0`, tworzy odpowiadający mu tag obrazu. Workflow nie wymaga dodatkowego sekretu, ponieważ korzysta z repozytoryjnego `GITHUB_TOKEN`.

Workflow `.github/workflows/deploy-pages.yml` publikuje ten sam katalog `dist/` jako GitHub Pages. W ustawieniach repozytorium należy wybrać `Settings > Pages > Source: GitHub Actions`. Dla odbiorców nietechnicznych jest to wygodniejsza forma udostępnienia niż obraz kontenera.

## Widoczność

Publiczne repozytorium i publiczny pakiet GHCR udostępniają model każdemu. W przypadku repozytorium prywatnego odbiorcy obrazu muszą uwierzytelnić się tokenem mającym co najmniej uprawnienie `read:packages`. Widoczność pakietu ustawia się po pierwszej publikacji w ustawieniach pakietu na GitHubie.

## Aktualizacja modeli

Viewer wykorzystuje pliki:

- `assets/kogni_lab_equipped_307_308.glb`;
- `assets/kogni_lab_equipped_307_308_variant_b.glb`;
- `assets/equipment_layout_a.json`;
- `assets/equipment_layout_b.json`.

Po ich podmianie należy ponownie wykonać `npm run build` albo zbudować obraz Dockera. Pliki źródłowe FreeCAD i screenshot planu nie są częścią tego repozytorium.
