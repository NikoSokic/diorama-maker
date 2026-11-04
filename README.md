# Diorama Maker

Web aplikacija koja od korisnikove priče radi animiranu 3D dioramu: LLM napiše scenarij (JSON), Tripo3D API generira low-poly GLB modele, a Three.js odigra priču.

Trenutno je ovo samo kostur projekta, bez poslovne logike.

## Preduvjeti

- JDK 21 ili noviji
- Node.js 22 ili noviji
- Docker s Docker Composeom
- [Bruno](https://www.usebruno.com/), za kolekciju u `bruno/`

## Postavljanje

Kopiraj `.env.example` u `.env` i popuni vrijednosti:

```
DB_URL=jdbc:postgresql://localhost:5432/diorama
DB_USER=diorama
DB_PASSWORD=<lozinka po izboru>
TRIPO_API_KEY=<tvoj ključ>
GEMINI_API_KEY=<tvoj ključ>
```

## Pokretanje

Baza, iz korijena projekta:

```bash
docker compose up -d
```

Backend, na `http://localhost:8080`:

```bash
# Bash
cd backend
set -a; source ../.env; set +a
./mvnw spring-boot:run
```

```powershell
# PowerShell
cd backend
Get-Content ..\.env | ForEach-Object { $name, $value = $_ -split '=', 2; Set-Item "env:$name" $value }
.\mvnw.cmd spring-boot:run
```

Provjera: `curl localhost:8080/api/health` vraća `{"status":"ok"}`.

Frontend, na `http://localhost:5173`:

```bash
cd frontend
npm install
npm run dev
```

Scena učitava `frontend/public/models/test.glb`. Ako te datoteke nema, prikazuje rotirajuću kocku.

## Bruno kolekcija

Otvori mapu `bruno/` u Brunu, odaberi environment `local` i u njemu upiši `tripoApiKey`. To je secret varijabla, pa vrijednost ne završava u repozitoriju. Zatim pokreni zahtjeve redom. Zahtjev 2 ponavljaj dok status ne bude `success`.

Rezultate spikea upisuj u `spike-notes.md`.
