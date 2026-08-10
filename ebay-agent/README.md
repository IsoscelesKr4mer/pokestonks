# eBay Agent

Local agent that drafts and publishes sealed Pokémon TCG listings via the [`ebay-mcp`](https://github.com/YosefHayim/ebay-mcp) MCP server, reading inventory and cost basis from the main Pokemon_Portfolio Drizzle DB.

See `CLAUDE.md` for the agent's operating rules.

## Setup (one time)

### 1. Create the eBay developer app
1. Sign up at https://developer.ebay.com/
2. Go to https://developer.ebay.com/my/keys
3. Create a **Production** keyset (we are skipping sandbox per project decision)
4. Copy the **App ID (Client ID)** and **Cert ID (Client Secret)**
5. In **User Tokens** settings, copy the **RuName** (eBay-format redirect URI)

### 2. Install the MCP server
```
npm install -g ebay-mcp
```
Requires Node 18+.

### 3. Run the setup wizard
```
npx ebay-mcp setup
```
The wizard will:
- Prompt for Client ID, Client Secret, Environment (`production`), and RuName
- Open a browser for the OAuth flow — sign in with Michael's eBay seller account
- Paste the auth code back into the wizard
- Auto-write the MCP server entry into Claude Desktop / Cursor config
- Save the refresh token

### 4. Copy local env
```
cp .env.example .env
```
The wizard populates a global `.env` for the npm-installed package, but keeping a copy of the values here makes the agent self-documenting and lets ad-hoc scripts in `scripts/` read from the same file.

### 5. Restart Claude Desktop (or Cursor)
The `ebay-mcp` tools should now be visible.

### 6. Smoke-test
Ask Claude:
> Use `ebay_get_inventory_locations` and tell me what comes back.

If you get a location, OAuth worked. If you get 401/403, rerun `npx ebay-mcp setup`.

## Daily use

Open this folder as the working directory in Claude Desktop / Cursor. The agent's `CLAUDE.md` will be loaded automatically and it will know:
- Where to read listing copy (`../eBay_assets/listings.md`)
- Where to read photos (`../eBay_assets/iCloud Photos/`)
- How to read inventory from the main app's Drizzle setup
- That every publish needs explicit approval

Typical session:
> List the next ETB from listings.md.

The agent will draft, show you the full preview, and wait for "publish" before calling any destructive tool.

## Reference
- Repo: https://github.com/YosefHayim/ebay-mcp
- npm: https://www.npmjs.com/package/ebay-mcp
- eBay dev portal: https://developer.ebay.com/
- Configuration deep-dive: https://github.com/YosefHayim/ebay-mcp/blob/main/docs/auth/CONFIGURATION.md
