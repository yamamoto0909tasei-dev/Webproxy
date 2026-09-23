const ALLOWED_HOSTS = [
  "example.com",
  "www.example.com"
];

function isAllowed(url) {
  return (
    url.protocol === "https:" &&
    ALLOWED_HOSTS.includes(url.hostname)
  );
}

function createProxyUrl(origin, url) {
  return origin + "/?url=" + encodeURIComponent(url.href);
}

export default {
  async fetch(request) {
    const requestUrl = new URL(request.url);
    const targetParam = requestUrl.searchParams.get("url");

    // =========================
    // トップページ
    // =========================

    if (!targetParam) {
      const html = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Web Proxy</title>
</head>
<body>
<form method="get">
<input
  name="url"
  type="url"
  placeholder="https://example.com/"
  required
>
<button type="submit">開く</button>
</form>
</body>
</html>`;

      return new Response(html, {
        status: 200,
        headers: {
          "content-type": "text/html; charset=UTF-8"
        }
      });
    }

    // =========================
    // URL解析
    // =========================

    let targetUrl;

    try {
      targetUrl = new URL(targetParam);
    } catch {
      return new Response("Invalid URL", {
        status: 400,
        headers: {
          "content-type": "text/plain; charset=UTF-8"
        }
      });
    }

    // =========================
    // 許可されたサイトか確認
    // =========================

    if (!isAllowed(targetUrl)) {
      return new Response("Host is not allowed.", {
        status: 403,
        headers: {
          "content-type": "text/plain; charset=UTF-8"
        }
      });
    }

    // =========================
    // サイトへ接続
    // =========================

    try {
      const headers = new Headers(request.headers);

      headers.delete("host");

      const options = {
        method: request.method,
        headers: headers,
        redirect: "follow"
      };

      if (
        request.method !== "GET" &&
        request.method !== "HEAD"
      ) {
        options.body = request.body;
      }

      const response = await fetch(
        targetUrl.href,
        options
      );

      const contentType =
        response.headers.get("content-type") || "";

      const responseHeaders =
        new Headers(response.headers);

      // =========================
      // HTML以外
      // =========================

      if (
        !contentType
          .toLowerCase()
          .includes("text/html")
      ) {
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: responseHeaders
        });
      }

      // =========================
      // HTMLのURLを書き換える
      // =========================

      const proxyOrigin = requestUrl.origin;
      const rewriter = new HTMLRewriter();

      const targets = [
        ["a", "href"],
        ["link", "href"],
        ["img", "src"],
        ["script", "src"],
        ["iframe", "src"],
        ["video", "src"],
        ["audio", "src"],
        ["source", "src"],
        ["form", "action"]
      ];

      for (const [selector, attribute] of targets) {
        rewriter.on(selector, {
          element(element) {
            const value =
              element.getAttribute(attribute);

            if (!value) {
              return;
            }

            // ページ内リンクなどは変更しない
            if (
              value.startsWith("#") ||
              value.startsWith("mailto:") ||
              value.startsWith("tel:") ||
              value.startsWith("javascript:")
            ) {
              return;
            }

            try {
              const absoluteUrl =
                new URL(value, targetUrl.href);

              if (!isAllowed(absoluteUrl)) {
                return;
              }

              const proxyUrl =
                createProxyUrl(
                  proxyOrigin,
                  absoluteUrl
                );

              element.setAttribute(
                attribute,
                proxyUrl
              );
            } catch {
              // URLとして解釈できない場合は変更しない
            }
          }
        });
      }

      // =========================
      // HTMLを返す
      // =========================

      return rewriter.transform(
        new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: responseHeaders
        })
      );

    } catch (error) {
      return new Response(
        "Proxy Error: " + error.message,
        {
          status: 502,
          headers: {
            "content-type":
              "text/plain; charset=UTF-8"
          }
        }
      );
    }
  }
};
