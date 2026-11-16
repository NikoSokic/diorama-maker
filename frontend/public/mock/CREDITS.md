# Mock-mode models

All are CC0 1.0 (public domain). No attribution is required; it is recorded anyway.

## Character library (mock mode)

Files: `backend/src/main/resources/mock-models/library/` (the only copy; the browser gets them through `/api/files`
like real Tripo output). Built by `frontend/scripts/build-mock-library.mjs` from
`frontend/scripts/mock-library.sources.json`: only the listed clips are kept, renamed to idle / walk / run / jump /
celebrate, then resampled and quantized. Every source was listed as CC0 1.0 on poly.pizza when it was chosen
(2026-11-16). The backend (`MockLibrary`) picks one per character by the Tripo prompt (English) and the display
name (Croatian or English); when nothing fits it falls back to the four basic samples below.

| File | Kind | Clips | Source | Licence |
|---|---|---|---|---|
| `fox.glb` | quadruped | idle, walk, run, jump | "Fox" by Quaternius, https://poly.pizza/m/Bc97C66HKi | CC0 1.0 |
| `dog.glb` | quadruped | idle, walk, run, jump | "Dog" by Quaternius, https://poly.pizza/m/2kUk0QqpCg | CC0 1.0 |
| `cat.glb` | quadruped | idle, walk, run, jump | "Cat" by Quaternius, https://poly.pizza/m/qKICY6xla2 | CC0 1.0 |
| `horse.glb` | quadruped | idle, walk, run, jump | "Horse" by Quaternius, https://poly.pizza/m/D3hAeqeDBE | CC0 1.0 |
| `unicorn.glb` | quadruped | idle, walk, run, jump | "White Horse" by Quaternius, https://poly.pizza/m/bEdE4rmZy9 | CC0 1.0 |
| `deer.glb` | quadruped | idle, walk, run, jump | "Deer" by Quaternius, https://poly.pizza/m/T6Cs7tmMHJ | CC0 1.0 |
| `wolf.glb` | quadruped | idle, walk, run, jump | "Wolf" by Quaternius, https://poly.pizza/m/XU7oNeKShV | CC0 1.0 |
| `cow.glb` | quadruped | idle, walk, run, jump | "Cow" by Quaternius, https://poly.pizza/m/5XSc2Fka3F | CC0 1.0 |
| `pig.glb` | quadruped | idle, walk, run, jump | "Pig" by Quaternius, https://poly.pizza/m/u35l6uP5vj | CC0 1.0 |
| `sheep.glb` | quadruped | idle, walk, run, jump | "Sheep" by Quaternius, https://poly.pizza/m/rgJXF570ZK | CC0 1.0 |
| `alpaca.glb` | quadruped | idle, walk, run, jump | "Alpaca" by Quaternius, https://poly.pizza/m/bCVFD48i2l | CC0 1.0 |
| `donkey.glb` | quadruped | idle, walk, run, jump | "Donkey" by Quaternius, https://poly.pizza/m/qmX6nhnvp7 | CC0 1.0 |
| `raccoon.glb` | quadruped | idle, walk, run, jump | "Raccoon" by Quaternius, https://poly.pizza/m/xMmx6VQP3r | CC0 1.0 |
| `hedgehog.glb` | quadruped | idle | "Hedgehog" by Quaternius, https://poly.pizza/m/Uu0PXwt2nU | CC0 1.0 |
| `bunny.glb` | biped | idle, walk, run, jump, celebrate | "Bunny" by Quaternius, https://poly.pizza/m/irZjWFARyl | CC0 1.0 |
| `bear.glb` | biped | idle, walk, run, jump, celebrate | "Panda" by Quaternius, https://poly.pizza/m/q1uJ28Hs8T | CC0 1.0 |
| `frog.glb` | biped | idle, walk, run, jump, celebrate | "Frog" by Quaternius, https://poly.pizza/m/37wofOCOzG | CC0 1.0 |
| `girl.glb` | biped | idle, walk, run, jump, celebrate | "Woman in Dress" by Quaternius, https://poly.pizza/m/zMyPlQXBzq | CC0 1.0 |
| `woman.glb` | biped | idle, walk, run, jump, celebrate | "Woman Casual" by Quaternius, https://poly.pizza/m/jpKRgGDxhk | CC0 1.0 |
| `man.glb` | biped | idle, walk, run, jump, celebrate | "Man" by Quaternius, https://poly.pizza/m/fjHyMd5Wxw | CC0 1.0 |
| `farmer.glb` | biped | idle, walk, run, celebrate | "Farmer" by Quaternius, https://poly.pizza/m/7pn3R6hPvE | CC0 1.0 |
| `king.glb` | biped | idle, walk, run, celebrate | "King" by Quaternius, https://poly.pizza/m/I1gTjmuK2m | CC0 1.0 |
| `wizard.glb` | biped | idle, walk, jump, celebrate | "Wizard" by Quaternius, https://poly.pizza/m/o87Upt5uHX | CC0 1.0 |
| `pirate.glb` | biped | idle, walk, run, jump, celebrate | "Pirate Captain" by Quaternius, https://poly.pizza/m/sN18LyyHAU | CC0 1.0 |
| `astronaut.glb` | biped | idle, walk, run, jump, celebrate | "Astronaut" by Quaternius, https://poly.pizza/m/OgeSH89Nmx | CC0 1.0 |
| `ninja.glb` | biped | idle, walk, run, jump, celebrate | "Ninja" by Quaternius, https://poly.pizza/m/xGYmeDpfTu | CC0 1.0 |
| `adventurer.glb` | biped | idle, walk, run, celebrate | "Adventurer" by Quaternius, https://poly.pizza/m/ZwF0K7WBmu | CC0 1.0 |
| `boy.glb` | biped | idle, walk, run, celebrate | "Casual Character" by Quaternius, https://poly.pizza/m/kZ3DmIoGip | CC0 1.0 |
| `skeleton.glb` | biped | idle, walk, run, jump, celebrate | "Skeleton" by Quaternius, https://poly.pizza/m/yq5ATpujSt | CC0 1.0 |
| `zombie.glb` | biped | idle, walk, run, jump | "Zombie" by Quaternius, https://poly.pizza/m/JoBvxIUpZP | CC0 1.0 |
| `goblin.glb` | biped | idle, walk, run, jump | "Goblin" by Quaternius, https://poly.pizza/m/OdCOFSmEhl | CC0 1.0 |
| `orc.glb` | biped | idle, walk, run, jump, celebrate | "Orc" by Quaternius, https://poly.pizza/m/5vO2YJsPEf | CC0 1.0 |
| `mushroom.glb` | biped | idle, walk, run, jump, celebrate | "Mushroom King" by Quaternius, https://poly.pizza/m/grnFTziU8u | CC0 1.0 |
| `alien.glb` | biped | idle, walk, run, jump, celebrate | "Alien" by Quaternius, https://poly.pizza/m/RRliSQBP7r | CC0 1.0 |
| `dino.glb` | biped | idle, walk, run, jump, celebrate | "Dino" by Quaternius, https://poly.pizza/m/wuerCFCWNR | CC0 1.0 |
| `dragon.glb` | creature | idle, walk, celebrate | "Dragon" by Quaternius, https://poly.pizza/m/3rUm1cN3yp | CC0 1.0 |
| `ghost.glb` | creature | idle, walk, celebrate | "Ghost" by Quaternius, https://poly.pizza/m/Iip30bDHmu | CC0 1.0 |
| `slime.glb` | creature | idle, walk | "Slime" by Quaternius, https://poly.pizza/m/LyjSUKHKnh | CC0 1.0 |
| `bat.glb` | creature | idle, walk | "Bat" by Quaternius, https://poly.pizza/m/hNO9XvjlKa | CC0 1.0 |
| `snake.glb` | creature | idle, walk, jump | "Snake" by Quaternius, https://poly.pizza/m/x9x0viZs8V | CC0 1.0 |
| `spider.glb` | creature | idle, walk, jump | "Spider" by Quaternius, https://poly.pizza/m/yRYJiAJyiM | CC0 1.0 |
| `fish.glb` | creature | idle, walk, run | "Clownfish" by Quaternius, https://poly.pizza/m/769fHo3eEB | CC0 1.0 |
| `shark.glb` | creature | idle, walk, run | "Shark" by Quaternius, https://poly.pizza/m/sZR8AMLMz5 | CC0 1.0 |
| `whale.glb` | creature | idle, walk | "Whale" by Quaternius, https://poly.pizza/m/JGFwp6xWgk | CC0 1.0 |
| `bird.glb` | creature | idle, walk, jump, celebrate | "Pigeon" by Quaternius, https://poly.pizza/m/9NGlBTpDEr | CC0 1.0 |
| `chicken.glb` | creature | idle, walk, run | "Chicken" by Quaternius, https://poly.pizza/m/Z3RCoCYss4 | CC0 1.0 |
| `bee.glb` | creature | static | "Bee" by Quaternius, https://poly.pizza/m/HvfIku26CK | CC0 1.0 |
| `car.glb` | object | static | "Car" by Quaternius, https://poly.pizza/m/unqqkULtRU | CC0 1.0 |
| `truck.glb` | object | static | "Truck" by Quaternius, https://poly.pizza/m/cXw6oiFtZ8 | CC0 1.0 |
| `boat.glb` | object | static | "Sail Boat" by Quaternius, https://poly.pizza/m/BgSZXwmm7k | CC0 1.0 |
| `chest.glb` | object | static | "Chest" by Quaternius, https://poly.pizza/m/RfSBvgcZUD | CC0 1.0 |
| `crown.glb` | object | static | "Crown" by Quaternius, https://poly.pizza/m/i0PZVuVlYv | CC0 1.0 |
| `book.glb` | object | static | "Book" by Quaternius, https://poly.pizza/m/h3Wh4fxSQX | CC0 1.0 |
| `star.glb` | object | static | "Star" by Quaternius, https://poly.pizza/m/Tyau1aS2r0 | CC0 1.0 |
| `lamp.glb` | object | static | "Lamp" by Quaternius, https://poly.pizza/m/RsWYHKkDhD | CC0 1.0 |

## Basic samples (fallback and bundled stories)

Copies in `frontend/public/mock` are used by `src/mock/stories.ts` so the bundled stories run with no backend;
the backend keeps the same four in `backend/src/main/resources/mock-models`.

| File | Used for | Source | Licence |
|---|---|---|---|
| `biped.glb` | rigged biped, clips Idle / Walking / Running / Jump / Dance (and more) | "RobotExpressive" by Tomás Laulhé, modified by Don McCurdy (three.js examples) | CC0 1.0 |
| `quadruped.glb` | quadruped with one clip (`Walk`) | generated by `scripts/make-mock-glbs.mjs` (own work) | CC0 1.0 |
| `creature.glb` | static creature | generated by `scripts/make-mock-glbs.mjs` (own work) | CC0 1.0 |
| `object.glb` | static object (mushroom) | generated by `scripts/make-mock-glbs.mjs` (own work) | CC0 1.0 |

`biped.glb` was identified from its contents, not from a recorded download; see the note in the backend's
`CREDITS.md` and confirm before publishing.

Everything else on screen (islands, trees, houses, props, weather) is generated in code
(`src/player/scene`), so there are no further third-party assets.

Fonts: Fredoka and Nunito, self-hosted through `@fontsource-variable/*` (SIL Open Font License 1.1).
