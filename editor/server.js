/**
 * The local editor's HTTP side: the rules live in src/api/core.js, shared with
 * the GitHub Pages build, and this file only hands them the disk under ../data.
 */
import express from "express";
import cors from "cors";
import {
  readFileSync, writeFileSync, existsSync,
  mkdirSync, readdirSync, rmSync,
} from "fs";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";
import { createCore, ApiError } from "./src/api/core.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(__dirname, "../data");
const at = (p) => join(DATA, ...p.split("/"));

const core = createCore({
  exists: (p) => existsSync(at(p)),
  read: (p) => JSON.parse(readFileSync(at(p), "utf8")),
  write: (p, v) => writeFileSync(at(p), JSON.stringify(v, null, 4) + "\n", "utf8"),
  ls: (p) => readdirSync(at(p)),
  rm: (p) => rmSync(at(p), { recursive: true, force: true }),
  mkdir: (p) => mkdirSync(at(p), { recursive: true }),
});

const app = express();
app.use(cors());
app.use(express.json());

/** One route: `fn(req)` returns the body, or throws an ApiError for the status. */
const route = (method, path, fn, status = 200) =>
  app[method](`/api${path}`, (req, res) => {
    try {
      res.status(status).json(fn(req.params, req.body ?? {}));
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
      res.status(err.status).json({ error: err.message });
    }
  });

const M = "/sports/:sport/markets/:market";

route("get", "/vocab", () => core.getVocab());

route("get", "/sports", () => core.getSports());
route("post", "/sports", (p, b) => core.createSport(b.key), 201);
route("delete", "/sports/:sport", (p) => core.deleteSport(p.sport));

route("post", "/sports/:sport/markets", (p, b) => core.createMarket(p.sport, b.key), 201);
route("delete", M, (p) => core.deleteMarket(p.sport, p.market));

route("get", `${M}/rules`, (p) => core.getRules(p.sport, p.market));
route("post", `${M}/rules`, (p, b) => core.createRule(p.sport, p.market, b), 201);
route("put", `${M}/rules/:rule`, (p, b) => core.updateRule(p.sport, p.market, p.rule, b));
route("delete", `${M}/rules/:rule`, (p) => core.deleteRule(p.sport, p.market, p.rule));

route("get", `${M}/bookmakers`, (p) => core.getMarketBookmakers(p.sport, p.market));
route("post", `${M}/bookmakers`, (p, b) => core.assignBookmaker(p.sport, p.market, b), 201);
route("put", `${M}/bookmakers/:bookmaker`, (p, b) => core.updateBookmakerRule(p.sport, p.market, p.bookmaker, b));
route("patch", `${M}/bookmakers/:bookmaker/check`, (p) => core.touchBookmakerCheck(p.sport, p.market, p.bookmaker));
route("delete", `${M}/bookmakers/:bookmaker`, (p) => core.removeBookmaker(p.sport, p.market, p.bookmaker));

route("get", "/sports/:sport/compatibility", (p) => core.getCompatibility(p.sport));
route("post", "/sports/:sport/compatibility", (p, b) => core.createCompatibility(p.sport, b), 201);
route("put", "/sports/:sport/compatibility/:slug", (p, b) => core.updateCompatibility(p.sport, p.slug, b));
route("delete", "/sports/:sport/compatibility/:slug", (p) => core.deleteCompatibility(p.sport, p.slug));

route("get", "/validate", () => core.validate());

const PORT = process.env.PORT ?? 3001;
app.listen(PORT, () => console.log(`payout-rules API: http://localhost:${PORT}`));
