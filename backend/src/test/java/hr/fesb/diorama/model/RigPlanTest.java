package hr.fesb.diorama.model;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import hr.fesb.diorama.config.DioramaProperties;
import hr.fesb.diorama.model.ModelRecord.AnimationClip;
import hr.fesb.diorama.testsupport.Fixtures;
import hr.fesb.diorama.testsupport.TestProps;
import org.junit.jupiter.api.Test;

class RigPlanTest {

	private final DioramaProperties.Tripo props = TestProps.of().tripo();

	@Test
	void bipedsGetTheFiveClipsInPriorityOrder() {
		RigPlan plan = RigPlan.forRigType("Biped", props).orElseThrow();

		assertThat(plan.rigModel()).isEqualTo("v1.0-20240301");
		assertThat(plan.presets()).containsExactly("preset:biped:walk", "preset:biped:idle", "preset:biped:run",
				"preset:biped:jump", "preset:biped:victory_celebration");
		assertThat(plan.limit(2).presets()).containsExactly("preset:biped:walk", "preset:biped:idle");
		assertThat(plan.limit(0).clips()).isEmpty();
	}

	@Test
	void otherRigTypesGetTheirSinglePresetOrNothing() {
		assertThat(RigPlan.forRigType("quadruped", props).orElseThrow().presets()).containsExactly("preset:quadruped:walk");
		assertThat(RigPlan.forRigType("quadruped", props).orElseThrow().rigModel()).isEqualTo("v2.5-20260210");
		assertThat(RigPlan.forRigType("serpentine", props).orElseThrow().presets()).containsExactly("preset:serpentine:march");
		assertThat(RigPlan.forRigType("avian", props)).isEmpty();
		assertThat(RigPlan.forRigType(null, props)).isEmpty();
	}

	@Test
	void theV3RigUsesUnprefixedPresets() {
		RigPlan plan = RigPlan.forRigType("biped", TestProps.of("tripo.biped-rig-model", "v3.0-20260909").tripo()).orElseThrow();

		assertThat(plan.presets()).containsExactly("preset:walk", "preset:idle", "preset:run", "preset:jump");
	}

	@Test
	void findsClipsByNameInTheMockBiped() {
		List<String> clipNames = GlbInspector.animationNames(Fixtures.mockGlb("biped"));
		assertThat(GlbInspector.hasSkin(Fixtures.mockGlb("biped"))).isTrue();

		List<AnimationClip> clips = RigPlan.forRigType("biped", props).orElseThrow().resolve(clipNames, "/anim.glb");

		assertThat(clips).extracting(AnimationClip::name).containsExactly("walk", "idle", "run", "jump", "celebrate");
		assertThat(clips).extracting(AnimationClip::clip).containsExactly("Walking", "Idle", "Running", "Jump", "Dance");
		assertThat(clips).extracting(AnimationClip::url).containsOnly("/anim.glb");
	}

	@Test
	void fallsBackToPositionWhenNamesSayNothing() {
		RigPlan plan = RigPlan.forRigType("biped", props).orElseThrow().limit(3);

		assertThat(plan.resolve(List.of("Take 001", "Take 002", "Take 003"), "u")).extracting(AnimationClip::clip)
			.containsExactly("Take 001", "Take 002", "Take 003");
		assertThat(plan.resolve(List.of("anim_run", "x", "y"), "u")).extracting(c -> c.name() + "=" + c.clip())
			.containsExactly("walk=x", "idle=y", "run=anim_run");
		// a different number of unnamed clips cannot be matched safely: those actions stay procedural
		assertThat(plan.resolve(List.of("a", "b"), "u")).isEmpty();
		assertThat(plan.resolve(List.of(), "u")).isEmpty();
	}

	@Test
	void inspectorIgnoresFilesThatAreNotGlb() {
		assertThat(GlbInspector.isGlb("<html>expired</html>".getBytes())).isFalse();
		assertThat(GlbInspector.isGlb(null)).isFalse();
		assertThat(GlbInspector.animationNames(new byte[40])).isEmpty();
		assertThat(GlbInspector.animationNames(Fixtures.mockGlb("quadruped"))).containsExactly("Walk");
		assertThat(GlbInspector.animationNames(Fixtures.mockGlb("creature"))).isEmpty();
	}

}
