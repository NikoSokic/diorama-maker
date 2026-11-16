import { useMemo } from 'react'
import { CameraRig } from './camera/CameraRig'
import { Actor } from './characters/Actor'
import { usePlayer } from './engine/store'
import { atmosphereFor } from './scene/atmosphere'
import { Capture, Effects, Ticker } from './scene/Effects'
import { ENVIRONMENT_PRESETS } from './scene/environments'
import { Lights } from './scene/Lights'
import { Clouds, Scenery } from './scene/Scenery'
import { SkyDome, Stars } from './scene/Sky'
import { WeatherEffects } from './scene/Weather'

const FALLBACK_COLORS = ['#ff9f7a', '#7ac8ff', '#ffd166']

/** Everything inside the canvas for the scene that is currently on. */
export function Stage() {
  const plan = usePlayer((s) => s.plan)
  const characters = usePlayer((s) => s.story.characters)
  const scene = usePlayer((s) => s.scenes[s.sceneIndex].scene)
  const quality = usePlayer((s) => s.quality)
  const env = ENVIRONMENT_PRESETS[scene.environment] ?? ENVIRONMENT_PRESETS.meadow
  const atmosphere = useMemo(() => atmosphereFor(env.kind, scene.timeOfDay, scene.weather), [env.kind, scene.timeOfDay, scene.weather])
  const colors = plan.palette.length > 0 ? plan.palette : FALLBACK_COLORS

  return (
    <>
      <Ticker />
      <CameraRig />
      <Lights atmosphere={atmosphere} quality={quality} />
      <SkyDome atmosphere={atmosphere} />
      <Stars opacity={atmosphere.starOpacity} />
      <Scenery atmosphere={atmosphere} />
      {env.clouds && <Clouds atmosphere={atmosphere} />}
      <WeatherEffects weather={scene.weather} ambient={env.ambient} quality={quality} />
      {plan.characters.map((character, index) => (
        <Actor
          key={character.key}
          plan={character}
          character={characters.find((c) => c.key === character.key)}
          color={colors[index % colors.length]}
          index={index}
        />
      ))}
      <Effects quality={quality} bloom={atmosphere.bloom} />
      <Capture />
    </>
  )
}
