package hr.fesb.diorama.narration;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.Optional;

/** Just enough of the RIFF/WAVE format to check a file before storing it and to know how long it plays. */
public final class Wav {

	public record Info(int sampleRate, int channels, int bitsPerSample, double durationSec) {
	}

	private Wav() {
	}

	/** Empty unless this is a PCM WAV file with a format chunk and a data chunk. */
	public static Optional<Info> inspect(byte[] bytes) {
		if (bytes == null || bytes.length < 44 || !ascii(bytes, 0, "RIFF") || !ascii(bytes, 8, "WAVE")) {
			return Optional.empty();
		}
		ByteBuffer buffer = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN);
		int pos = 12;
		Integer rate = null;
		int channels = 0;
		int bits = 0;
		while (pos + 8 <= bytes.length) {
			String id = new String(bytes, pos, 4, java.nio.charset.StandardCharsets.US_ASCII);
			long size = Integer.toUnsignedLong(buffer.getInt(pos + 4));
			int body = pos + 8;
			if (id.equals("fmt ") && size >= 16 && body + 16 <= bytes.length) {
				if (buffer.getShort(body) != 1) {
					return Optional.empty(); // not plain PCM
				}
				channels = buffer.getShort(body + 2);
				rate = buffer.getInt(body + 4);
				bits = buffer.getShort(body + 14);
			}
			else if (id.equals("data") && rate != null) {
				int bytesPerSecond = rate * channels * bits / 8;
				if (rate <= 0 || channels <= 0 || bits <= 0 || bytesPerSecond <= 0) {
					return Optional.empty();
				}
				// streaming writers may leave the size at its maximum: count what is really there
				long available = Math.min(size, bytes.length - (long) body);
				return Optional.of(new Info(rate, channels, bits, available / (double) bytesPerSecond));
			}
			pos = body + (int) Math.min(size + (size & 1), Integer.MAX_VALUE - body);
		}
		return Optional.empty();
	}

	private static boolean ascii(byte[] bytes, int offset, String text) {
		for (int i = 0; i < text.length(); i++) {
			if (bytes[offset + i] != text.charAt(i)) {
				return false;
			}
		}
		return true;
	}

}
