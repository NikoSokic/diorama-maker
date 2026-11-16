package hr.fesb.diorama.model;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.ArrayList;
import java.util.List;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/** Reads the JSON chunk of a binary glTF: enough to validate a download and to list its animation clips. */
public final class GlbInspector {

	private static final int MAGIC_GLTF = 0x46546C67;
	private static final int CHUNK_JSON = 0x4E4F534A;
	private static final ObjectMapper JSON = new ObjectMapper();

	private GlbInspector() {
	}

	public static boolean isGlb(byte[] bytes) {
		return bytes != null && bytes.length >= 20
				&& ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN).getInt(0) == MAGIC_GLTF;
	}

	/** Clip names in file order (unnamed clips become {@code ""}); empty when there are none or on any error. */
	public static List<String> animationNames(byte[] bytes) {
		List<String> names = new ArrayList<>();
		for (JsonNode animation : json(bytes).path("animations")) {
			names.add(animation.path("name").asText(""));
		}
		return names;
	}

	public static boolean hasSkin(byte[] bytes) {
		return json(bytes).path("skins").size() > 0;
	}

	private static JsonNode json(byte[] bytes) {
		if (!isGlb(bytes)) {
			return JSON.createObjectNode();
		}
		ByteBuffer buffer = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN);
		int length = buffer.getInt(12);
		if (buffer.getInt(16) != CHUNK_JSON || length < 0 || 20L + length > bytes.length) {
			return JSON.createObjectNode();
		}
		try {
			JsonNode node = JSON.readTree(bytes, 20, length);
			return node == null ? JSON.createObjectNode() : node;
		}
		catch (java.io.IOException e) {
			return JSON.createObjectNode();
		}
	}

}
