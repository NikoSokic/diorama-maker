# Diorama Maker

Web aplikacija koja od kratke priče radi animiranu 3D slikovnicu: Gemini priču pretvori u scenarij (JSON), Tripo3D API generira 3D modele likova, a Three.js odigra priču s naracijom i titlovima.

Projekt je u izradi. Stanje i odluke: [PROGRESS.md](PROGRESS.md). Specifikacija: [docs/DIORAMA_SPEC.md](docs/DIORAMA_SPEC.md). Bilješke o API-jima: [docs/API_NOTES.md](docs/API_NOTES.md).

## Preduvjeti

- JDK 21 ili noviji (Maven dolazi kroz `mvnw`, ne treba ga instalirati)
- Node.js 22 ili noviji
- Računi: Tripo3D (API ključ), Google AI Studio (Gemini ključ), Supabase (baza i Storage)
- Neobavezno: [Bruno](https://www.usebruno.com/) za kolekciju u `bruno/`, Docker za lokalni Postgres umjesto Supabasea

## Postavljanje

1. Kopiraj `.env.example` u `.env` i popuni vrijednosti. Datoteka `.env` se ne commita.
2. Iz korijena projekta provjeri ključeve:

```powershell
npm install
npm run verify
```

Skripte ispisuju samo stanje (npr. broj kredita), nikad same ključeve. `TRIPO_MODE=mock` je zadana vrijednost i ne troši kredite.

## Pokretanje

Backend, na `http://localhost:8080` (sam učitava `../.env`):

```powershell
cd backend
.\mvnw.cmd spring-boot:run
```

Provjera: `curl.exe localhost:8080/api/health` vraća `{"status":"ok"}`.

Frontend, na `http://localhost:5173`:

```powershell
cd frontend
npm install
npm run dev
```

## Provjere prije commita

```powershell
cd backend; .\mvnw.cmd -q -B verify
cd ..\frontend; npm run build; npm run lint; npm test
```

## Bruno kolekcija

Otvori mapu `bruno/` u Brunu, odaberi environment `local` i u njemu upiši `tripoApiKey`. To je secret varijabla, pa vrijednost ne završava u repozitoriju. Zahtjev 0 samo čita stanje kredita. Zahtjev 1 troši prave kredite. Zahtjev 2 ponavljaj dok status ne bude `success`, a zatim odmah pokreni zahtjev 3 jer poveznica na model istječe za 5 minuta.
