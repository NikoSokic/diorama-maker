// The three materials all scenery shares: solid (vertex colours, wind sway), glow (unlit, bright enough to
// bloom) and water (translucent with moving flecks of light).

import { MeshBasicMaterial, MeshStandardMaterial } from 'three'

export interface SceneryMaterials {
  solid: MeshStandardMaterial
  glow: MeshBasicMaterial
  water: MeshStandardMaterial
  uniforms: { uTime: { value: number }; uWind: { value: number } }
  dispose(): void
}

const SWAY_HEAD = /* glsl */ `
  attribute float sway;
  uniform float uTime;
  uniform float uWind;
`

const SWAY_BODY = /* glsl */ `
  #include <begin_vertex>
  float swayPhase = uTime * 1.6 + position.x * 0.7 + position.z * 0.5;
  transformed.x += sway * uWind * sin(swayPhase);
  transformed.z += sway * uWind * 0.6 * cos(swayPhase * 0.83);
`

export function createSceneryMaterials(): SceneryMaterials {
  const uniforms = { uTime: { value: 0 }, uWind: { value: 1 } }

  const solid = new MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0 })
  solid.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime
    shader.uniforms.uWind = uniforms.uWind
    shader.vertexShader = SWAY_HEAD + shader.vertexShader.replace('#include <begin_vertex>', SWAY_BODY)
  }

  const glow = new MeshBasicMaterial({ vertexColors: true })

  const water = new MeshStandardMaterial({ vertexColors: true, roughness: 0.16, metalness: 0, transparent: true, opacity: 0.84 })
  water.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime
    shader.vertexShader =
      'varying vec3 vWaterPos;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n  vWaterPos = (modelMatrix * vec4(position, 1.0)).xyz;',
      )
    shader.fragmentShader =
      'varying vec3 vWaterPos;\nuniform float uTime;\n' +
      shader.fragmentShader.replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
        {
          // Flecks of light wandering over the surface.
          float a = sin(vWaterPos.x * 1.6 + uTime * 0.8 + sin(vWaterPos.z * 1.2 + uTime * 0.5) * 1.6);
          float b = sin(vWaterPos.z * 2.0 - uTime * 0.6 + sin(vWaterPos.x * 0.9 - uTime * 0.4) * 1.4);
          float fleck = smoothstep(0.86, 1.0, a * b * 0.5 + 0.5);
          float ripple = 0.5 + 0.5 * sin(length(vWaterPos.xz) * 2.4 - uTime * 1.1);
          diffuseColor.rgb += fleck * 0.3 + ripple * 0.035;
        }`,
        )
        // Water keeps some colour of its own, or warm evening light turns it grey.
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += diffuseColor.rgb * 0.28;')
  }

  return {
    solid,
    glow,
    water,
    uniforms,
    dispose() {
      solid.dispose()
      glow.dispose()
      water.dispose()
    },
  }
}
