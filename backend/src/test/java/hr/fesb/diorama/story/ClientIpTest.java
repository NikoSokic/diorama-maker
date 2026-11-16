package hr.fesb.diorama.story;

import static org.assertj.core.api.Assertions.assertThat;

import hr.fesb.diorama.testsupport.TestProps;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

class ClientIpTest {

	private static MockHttpServletRequest request(String remoteAddress, String... forwardedFor) {
		MockHttpServletRequest request = new MockHttpServletRequest();
		request.setRemoteAddr(remoteAddress);
		for (String header : forwardedFor) {
			request.addHeader("X-Forwarded-For", header);
		}
		return request;
	}

	@Test
	void ignoresForwardedHeadersUnlessAProxyIsTrusted() {
		ClientIp ip = new ClientIp(TestProps.of("ip-hash-salt", "s"));

		assertThat(ip.address(request("203.0.113.9", "127.0.0.1"))).isEqualTo("203.0.113.9");
	}

	@Test
	void readsTheEntryWrittenByTheTrustedProxyNotTheOneTheClientSent() {
		ClientIp ip = new ClientIp(TestProps.of("ip-hash-salt", "s", "trust-proxy", "true"));

		// the client forged "127.0.0.1"; the proxy appended the address it really saw
		String address = ip.address(request("10.0.0.2", "127.0.0.1, 198.51.100.7"));

		assertThat(address).isEqualTo("198.51.100.7");
		assertThat(ClientIp.isLoopback(address)).isFalse();
	}

	@Test
	void joinsRepeatedHeadersBeforeCountingFromTheRight() {
		ClientIp ip = new ClientIp(TestProps.of("ip-hash-salt", "s", "trust-proxy", "true"));

		assertThat(ip.address(request("10.0.0.2", "127.0.0.1", "198.51.100.7"))).isEqualTo("198.51.100.7");
	}

	@Test
	void countsBackOneEntryPerTrustedProxy() {
		ClientIp ip = new ClientIp(TestProps.of("ip-hash-salt", "s", "trust-proxy", "true", "trusted-proxy-hops", "2"));

		assertThat(ip.address(request("10.0.0.2", "127.0.0.1, 198.51.100.7, 172.16.0.1"))).isEqualTo("198.51.100.7");
		// fewer entries than proxies: take the leftmost rather than failing
		assertThat(ip.address(request("10.0.0.2", "198.51.100.7"))).isEqualTo("198.51.100.7");
	}

	@Test
	void fallsBackToTheSocketAddressWhenTheHeaderIsMissingOrGarbage() {
		ClientIp ip = new ClientIp(TestProps.of("ip-hash-salt", "s", "trust-proxy", "true"));

		assertThat(ip.address(request("203.0.113.9"))).isEqualTo("203.0.113.9");
		assertThat(ip.address(request("203.0.113.9", "198.51.100.7, <script>"))).isEqualTo("203.0.113.9");
	}

	@Test
	void hashesAreSaltedAndStable() {
		ClientIp a = new ClientIp(TestProps.of("ip-hash-salt", "one"));
		ClientIp b = new ClientIp(TestProps.of("ip-hash-salt", "two"));

		assertThat(a.hash("203.0.113.9")).isEqualTo(a.hash("203.0.113.9")).hasSize(64).doesNotContain("203.0.113.9");
		assertThat(a.hash("203.0.113.9")).isNotEqualTo(b.hash("203.0.113.9")).isNotEqualTo(a.hash("203.0.113.10"));
	}

	@Test
	void recognisesLoopbackLiteralsOnly() {
		assertThat(ClientIp.isLoopback("127.0.0.1")).isTrue();
		assertThat(ClientIp.isLoopback("::1")).isTrue();
		assertThat(ClientIp.isLoopback("0:0:0:0:0:0:0:1")).isTrue();
		assertThat(ClientIp.isLoopback("192.168.1.5")).isFalse();
		assertThat(ClientIp.isLoopback("localhost")).isFalse();
		assertThat(ClientIp.isLoopback(null)).isFalse();
	}

}
