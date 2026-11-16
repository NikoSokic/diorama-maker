# Diorama Maker

Napiši kratku priču (do 500 znakova, na hrvatskom ili engleskom) i gledaj kako oživi kao mala animirana 3D slikovnica u pregledniku: Gemini od priče napravi scenarij, Tripo3D izradi 3D modele likova, a Three.js odigra predstavu s pripovjedačem, titlovima i kamerom.

Sve radi na besplatnim razinama usluga (0 €). Bez ijednog ključa aplikacija radi u *mock* načinu, s ugrađenim primjerima modela.

| Početna stranica | Čekanje dok priča nastaje | Player |
|---|---|---|
| ![Početna stranica](docs/screenshots/home.jpg) | ![Zaslon napretka](docs/screenshots/progress.jpg) | ![Player usred priče](docs/screenshots/player.jpg) |

## Kako radi

1. Korisnik pošalje priču. Backend je provjeri (duljina, moderacija, dnevno ograničenje po IP adresi) i odmah vrati kratku adresu priče (`/s/<slug>`).
2. **Gemini** priču pretvara u *StoryPlan*: JSON s likovima, scenama, okolišem, dobom dana, vremenom, radnjama, kamerom i tekstom pripovjedača. Odgovor je vezan JSON shemom i dodatno se provjerava na backendu. Ako Gemini nije dostupan, plan složi ugrađeni offline planer.
3. **Tripo3D** za svaki lik izradi 3D model iz teksta. Dvonošci dobivaju kostur i pet animacija, četveronošci hod, a ostali ostaju statični. Čuvar kredita prije svakog koraka provjeri stanje i po potrebi smanji opseg (manje animacija → bez kostura → zamjenski model).
4. Modeli se spremaju u **Supabase Storage** (ili na lokalni disk u mock načinu), a stanje priče u **Postgres**.
5. Frontend svake 2 sekunde pita za stanje i prikazuje napredak po likovima. Kad je priča gotova, **player** je odigra: okoliš i rekviziti nastaju proceduralno, a likovi se kreću po vremenskoj crti iz plana.

```mermaid
flowchart LR
    U([Korisnik]) -->|priča, do 500 znakova| FE

    subgraph Preglednik
        FE[React + Vite<br/>stranice, HR/EN]
        PL[Player<br/>React Three Fiber]
        FE --> PL
    end

    subgraph Backend [Spring Boot backend]
        API[REST API<br/>/api/stories]
        PIPE[Cjevovod priče<br/>moderacija, plan, modeli]
        GUARD[Čuvar kredita]
        API --> PIPE --> GUARD
    end

    FE -->|POST priča, GET stanje svake 2 s| API
    PIPE -->|StoryPlan JSON| GEM[(Gemini API)]
    GUARD -->|model, kostur, animacije| TRI[(Tripo3D API)]
    PIPE -->|priče, likovi, stanje| DB[(Postgres<br/>Supabase)]
    PIPE -->|GLB datoteke| ST[(Supabase Storage<br/>ili lokalni disk)]
    ST -->|GLB modeli| PL
```

## Tehnologije

| Dio | Što se koristi |
|---|---|
| Backend | Java 21, Spring Boot 3.5, JdbcClient (obični SQL), Flyway, Maven wrapper |
| Frontend | React 19, TypeScript, Vite, React Three Fiber + drei + postprocessing, Tailwind 4, zustand, motion |
| Baza i datoteke | Supabase Postgres i Storage (besplatna razina); u Dockeru lokalni Postgres |
| Vanjski API-ji | Google Gemini (plan priče), Tripo3D v3 (modeli, kostur, animacije) |
| Testovi | JUnit s ugrađenim Postgresom, Vitest, Playwright |

## Pokretanje

### Najbrže: Docker

```powershell
docker compose up --build
```

Otvori http://localhost:5173. Ne treba nijedan ključ: bez datoteke `.env` backend radi u mock načinu (offline planer, primjeri modela, lokalni Postgres). Ako `.env` postoji, koriste se ključevi iz nje, npr. `GEMINI_API_KEY` za prave planove priča.

### Razvojno okruženje

Preduvjeti: JDK 21 ili noviji (Maven dolazi kroz `mvnw`), Node.js 22 ili noviji te računi za Tripo3D, Google AI Studio i Supabase.

1. Kopiraj `.env.example` u `.env` i upiši vrijednosti. Datoteka `.env` se ne commita. Komentari smiju biti samo u vlastitom retku, bez navodnika i obrnutih kosih crta, jer istu datoteku čitaju i Node i Spring.
2. Provjeri ključeve iz korijena projekta. Skripte ispisuju samo stanje (npr. broj kredita), nikad same ključeve:

   ```powershell
   npm install
   npm run verify
   ```

3. Pokreni backend na http://localhost:8080 (sam učita `../.env`):

   ```powershell
   cd backend
   .\mvnw.cmd spring-boot:run
   ```

   Provjera: `curl.exe localhost:8080/api/health` vraća `{"status":"ok", ...}` s trenutnim načinom rada.

4. Pokreni frontend na http://localhost:5173 (prosljeđuje `/api` na 8080):

   ```powershell
   cd frontend
   npm install
   npm run dev
   ```

Player se može gledati i bez backenda, na ugrađenim pričama: http://localhost:5173/dev/player?story=mock-robot.

### Mock i live način

`TRIPO_MODE=mock` je zadana vrijednost: ne zove Tripo i ne troši kredite, a likovi dobivaju ugrađene primjere modela. `TRIPO_MODE=live` troši prave kredite (statični model 20, četveronožac s hodom 55, potpuno animirani dvonožac 95). Prije pokretanja provjeri stanje s `npm run verify:tripo`; backend ionako ne troši više od onoga što je na računu.

## Provjere

```powershell
cd backend; .\mvnw.cmd -q -B verify
cd ..\frontend; npm run build; npm run lint; npm test
npm run smoke
```

`npm run smoke` su Playwright testovi koji u pravom pregledniku prođu put od obrasca preko zaslona čekanja do playera, navigaciju, promjenu jezika i stranice s greškama. Testovi nikad ne zovu vanjske API-je. Uz pokrenut razvojni poslužitelj postoje i `npm run playthrough` (cijela priča u pregledniku) te `npm run shots` (snimke zaslona playera za vizualnu provjeru).

## API backenda

| Metoda | Putanja | Što radi |
|---|---|---|
| `POST` | `/api/stories` | prima `{"text": "...", "lang": "hr" \| "en"}`, vraća `202` i `slug` |
| `GET` | `/api/stories/{slug}` | stanje priče, napredak po likovima i, kad je gotova, plan i adrese modela |
| `GET` | `/api/stories?limit=12` | javne priče za galeriju, najnovije prve |
| `GET` | `/api/health` | stanje i način rada (mock ili live) |
| `GET` | `/api/credits` | stanje Tripo kredita; samo lokalno ili uz `X-Admin-Token` |
| `GET` | `/api/files/**` | modeli s lokalnog diska (mock način) |

Puni ugovor s primjerima odgovora i greškama je u [docs/API_NOTES.md](docs/API_NOTES.md), poglavlje 4.

## Struktura projekta

```
backend/    Spring Boot aplikacija (paket hr.fesb.diorama), Flyway migracije, primjeri modela za mock način
frontend/   React aplikacija: stranice, i18n (HR/EN), player (src/player), Playwright i Vitest testovi
scripts/    Node skripte za provjeru ključeva (ne ispisuju tajne)
docs/       specifikacija, bilješke o API-jima, snimke zaslona
bruno/      Bruno kolekcija za ručno isprobavanje Tripo API-ja
```

Stanje projekta i odluke: [PROGRESS.md](PROGRESS.md). Specifikacija: [docs/DIORAMA_SPEC.md](docs/DIORAMA_SPEC.md).

## Poznata ograničenja

- **Prava (live) Tripo priča još nije odigrana.** Račun ima 0 kredita, a najmanja nadoplata izlazi iz budžeta od 0 €. Live put je pokriven testovima prema lažnom Tripo poslužitelju, ali nije potvrđen na pravom API-ju. Sve snimke zaslona su iz mock načina. Koraci za live pokretanje su u [NEEDS_OWNER.md](NEEDS_OWNER.md).
- Docker postavke nisu izgrađene na razvojnom računalu (na njemu nema Dockera), pa su provjerene samo čitanjem.
- Nema korisničkih računa: polica „Tvoje priče” živi u `localStorage` preglednika.
- Sličice u galeriji crtaju se iz okoliša i palete priče, jer prave sličice traže live Tripo modele.

## Bruno kolekcija

Otvori mapu `bruno/` u Brunu, odaberi environment `local` i u njemu upiši `tripoApiKey`. To je secret varijabla, pa vrijednost ne završava u repozitoriju. Zahtjev 0 samo čita stanje kredita. Zahtjev 1 troši prave kredite. Zahtjev 2 ponavljaj dok status ne bude `success`, a zatim odmah pokreni zahtjev 3 jer poveznica na model istječe za 5 minuta.

## Zasluge

Primjeri modela za mock način su pod licencom CC0 1.0 (robot „RobotExpressive”: Tomás Laulhé i Don McCurdy); izvori su u [frontend/public/mock/CREDITS.md](frontend/public/mock/CREDITS.md).
