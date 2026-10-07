// wrangler types が生成する Env（worker-configuration.d.ts）に、設定ファイルに書かない変数を足す。
// 本番は dashboard の Variables か `wrangler secret put` で入れる。
interface Env {
  /** Cloudflare Access のチームドメイン。例: example.cloudflareaccess.com */
  ACCESS_TEAM_DOMAIN?: string
  /** Access アプリケーションの Audience タグ */
  ACCESS_AUD?: string
}
