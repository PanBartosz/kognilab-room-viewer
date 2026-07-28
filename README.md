# KogniLab Room Viewer

Interaktywny viewer 3D dwóch wariantów aranżacji pomieszczeń KogniLabu 307 i 308. Aplikacja jest statyczna: po zbudowaniu nie wymaga backendu ani połączeń z zewnętrznymi CDN.

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
