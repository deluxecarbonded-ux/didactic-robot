/* ==========================================================================
   Exotic — cloud
   The single place that knows how to read and write player data. Two realms,
   completely separated: `single` uses Shards / sp_* tables, `multi` uses
   Cores / mp_* tables. Auth sessions are separate too, so a player can be
   signed into both with different accounts at the same time.

   When Supabase is not configured every call resolves against a local
   backend with identical shapes, so the game is fully playable offline —
   no fake users, no fake data, just your own local vault.
   ========================================================================== */
(function (global) {
  "use strict";
  var X = (global.Exotic = global.Exotic || {});
  var util = X.util;
  var Emitter = X.Emitter;
  var CFG = X.config;
  var SK = CFG.STORAGE_KEYS;

  /* ------------------------------------------------------------ profiles -- */

  function baseProfile(realm) {
    return {
      id: util.uid("local"),
      realm: realm,
      username: "",
      display_name: "",
      email: "",
      avatar_seed: Math.floor(Math.random() * 9999),
      level: 1,
      xp: 0,
      created_at: Date.now(),
      last_seen: Date.now(),
      /* progression */
      runs_played: 0,
      runs_won: 0,
      puzzles_solved: 0,
      puzzles_failed: 0,
      hints_used: 0,
      perfects: 0,
      no_hint_wins: 0,
      streak: 0,
      best_streak: 0,
      best_time_ms: 0,
      total_score: 0,
      category_stats: {},
      tier_clears: {},
      badges: [],
      equipped: { frame: null, trail: null, boardSkin: null, title: null },
      ai_uses: 0,
      dailies_done: 0,
      daily_streak: 0,
      spent: 0
    };
  }

  function realmFields(realm, p) {
    if (realm === "single") {
      p.shards = CFG.REWARDS.sp ? X.Shop.startingBalance.sp : 500;
      p.owned = 0;
    } else {
      p.cores = X.Shop.startingBalance.mp;
      p.elo = 1000;
      p.rank_id = "iron";
      p.matches = 0;
      p.wins = 0;
      p.losses = 0;
      p.ranked_wins = 0;
      p.host_wins = 0;
      p.owned = 0;
      p.season = new Date().getFullYear() + "-" + (Math.floor(new Date().getMonth() / 3) + 1);
    }
    return p;
  }

  /* ---------------------------------------------------------------- Realm -- */

  function Realm(name) {
    Emitter.call(this);
    this.name = name;
    this.currency = name === "multi" ? "mp" : "sp";
    this.offlineKey = name === "multi" ? SK.mpProfile : SK.spProfile;
    this.inventoryKey = name === "multi" ? SK.mpInventory : SK.spInventory;
    this.historyKey = name === "multi" ? SK.mpHistory : SK.spHistory;
    this.runKey = name === "multi" ? SK.mpCurrent : SK.spCurrent;
    this.profile = null;
    this.inventory = util.storage.get(this.inventoryKey, []);
    this.history = util.storage.get(this.historyKey, []);
    this._ready = false;
  }
  Realm.prototype = Object.create(Emitter.prototype);
  Realm.prototype.constructor = Realm;

  Realm.prototype.client = function () { return X.SBfor(this.name); };
  Realm.prototype.online = function () { return CFG.isCloudReady(); };
  Realm.prototype.local = function () { return !this.online(); };
  Realm.prototype.offline = function () { return !this.online(); };
  Realm.prototype.table = function (base) { return (this.name === "multi" ? "mp_" : "sp_") + base; };

  Realm.prototype.me = function () { return this.profile; };
  Realm.prototype.userId = function () {
    var u = this.client().user();
    return u ? u.id : (this.profile ? this.profile.id : null);
  };

  /* -------------------------------------------------------------- bootstrap */

  Realm.prototype.init = function () {
    var self = this;
    if (this._ready) return Promise.resolve(this.profile);
    this.client().configure(CFG.get("supabaseUrl"), CFG.get("supabaseAnonKey"));
    if (this.offline() && !this.profile) {
      this.profile = this._loadLocalProfile();
      this._ready = true;
      this.emit("ready", this.profile);
      return Promise.resolve(this.profile);
    }
    this._ready = true;
    return this.refresh();
  };

  Realm.prototype._loadLocalProfile = function () {
    var saved = util.storage.get(this.offlineKey, null);
    if (saved && saved.id) return saved;
    var p = realmFields(this.name, baseProfile(this.name));
    p.username = "you";
    p.display_name = "You";
    util.storage.set(this.offlineKey, p);
    /* welcome bundle so the shop is not an empty shelf on day one */
    var bundle = X.Shop.welcomeBundle[this.currency] || [];
    var self = this;
    bundle.forEach(function (id) { self.addToInventory(id, 1, true); });
    return p;
  };

  Realm.prototype._saveLocalProfile = util.debounce(function () {
    if (this.profile && this.offline()) util.storage.set(this.offlineKey, this.profile);
  }, 180);

  Realm.prototype.persist = function () { this._saveLocalProfile(); return this; };

  /** Pull the freshest profile for the signed-in (or local) user. */
  Realm.prototype.refresh = function () {
    var self = this;
    if (this.local()) {
      this.profile = this._loadLocalProfile();
      this.emit("profile", this.profile);
      return Promise.resolve(this.profile);
    }
    var user = this.client().user();
    if (!user) {
      this.profile = null;
      this.emit("profile", null);
      return Promise.resolve(null);
    }
    return this.client().from(this.table("profiles")).select("*").eq("id", user.id).maybeSingle()
      .then(function (row) {
        if (row) return self._adopt(row, user, false);
        return self._createRemote(user);
      })
      .catch(function (err) {
        self.emit("error", err);
        return null;
      });
  };

  Realm.prototype._adopt = function (row, user, isNew) {
    this.profile = util.merge(realmFields(this.name, baseProfile(this.name)), row);
    this.profile.realm = this.name;
    this.profile.email = user ? user.email : this.profile.email;
    if (isNew) util.storage.set(this.offlineKey, this.profile);
    this.emit("profile", this.profile);
    return this.profile;
  };

  Realm.prototype._createRemote = function (user) {
    var self = this;
    var seed = realmFields(this.name, baseProfile(this.name));
    var usernameBase = (user.email || "cipher").split("@")[0].replace(/[^a-zA-Z0-9_]/g, "").slice(0, 16) || "cipher";
    var row = util.merge(seed, {
      id: user.id,
      username: usernameBase + util.randInt(10, 99),
      display_name: util.titleCase(usernameBase),
      email: user.email
    });
    delete row.realm;
    return this.client().from(this.table("profiles")).insert(row).select("*").single()
      .then(function (created) {
        return self._adopt(created, user, true);
      })
      .catch(function (err) {
        /* RLS may block the read-back; fall back to the local shape */
        self.emit("error", err);
        return self._adopt(util.merge(row, { id: user.id }), user, true);
      });
  };

  /**
   * Ensure a profile exists for a freshly signed-in user, then apply any
   * local-only fields the player set before signing in.
   */
  Realm.prototype.ensure = function () {
    var self = this;
    if (this.local()) return Promise.resolve(this._loadLocalProfile());
    if (!this.client().isSignedIn()) return Promise.resolve(null);
    return this.refresh().then(function (p) {
      if (p) self.touch();
      return p;
    });
  };

  /* ------------------------------------------------------------ mutations -- */

  Realm.prototype.patch = function (patch) {
    var self = this;
    if (!this.profile) return Promise.resolve(null);
    Object.keys(patch).forEach(function (k) { self.profile[k] = patch[k]; });
    this.profile.last_seen = Date.now();
    this.emit("profile", this.profile);
    if (this.local()) {
      this.persist();
      return Promise.resolve(this.profile);
    }
    var id = this.profile.id;
    var clean = util.merge({}, patch);
    delete clean.realm;
    return this.client().from(this.table("profiles")).update(clean).eq("id", id)
      .then(function () { return self.profile; })
      .catch(function (err) { self.emit("error", err); return self.profile; });
  };

  Realm.prototype.touch = function () {
    return this.patch({ last_seen: Date.now() });
  };

  Realm.prototype.bump = function (field, by) {
    var cur = this.profile ? (this.profile[field] || 0) : 0;
    var patch = {};
    patch[field] = cur + (by == null ? 1 : by);
    return this.patch(patch);
  };

  /* --------------------------------------------------------------- wallet -- */

  Realm.prototype.balance = function () {
    if (!this.profile) return 0;
    return this.name === "multi" ? (this.profile.cores || 0) : (this.profile.shards || 0);
  };

  Realm.prototype._balanceField = function () {
    return this.name === "multi" ? "cores" : "shards";
  };

  Realm.prototype.grant = function (amount, reason) {
    var self = this;
    var value = Math.max(0, Math.round(amount || 0));
    if (!value) return Promise.resolve(0);
    var field = this._balanceField();
    var bonusKey = this.name === "multi" ? "mp-perk-dividend" : "sp-perk-dividend";
    var perk = this.hasItem(bonusKey) ? 0.2 : 0;
    if (this.name === "multi" && this.hasItem("mp-perk-dividend")) perk = 0.25;
    if (this.name === "single" && this.hasItem("sp-perk-dividend")) perk = 0.2;
    var total = Math.round(value * (1 + perk));

    if (this.online() && this.profile) {
      return this.client().rpc("grant_currency", { p_realm: this.name, p_amount: total, p_reason: reason || "play" })
        .then(function (newBalance) {
          self.profile[field] = typeof newBalance === "number" ? newBalance : (self.profile[field] + total);
          self.emit("profile", self.profile);
          return total;
        })
        .catch(function () {
          self.profile[field] = (self.profile[field] || 0) + total;
          return self.patch({}).then(function () { return total; });
        });
    }
    this.profile[field] = (this.profile[field] || 0) + total;
    this.persist();
    this.emit("profile", this.profile);
    return Promise.resolve(total);
  };

  Realm.prototype.spend = function (amount, reason) {
    var self = this;
    var value = Math.max(0, Math.round(amount || 0));
    if (value > this.balance()) return Promise.reject(new Error("Not enough " + (this.name === "multi" ? "cores" : "shards") + "."));
    if (this.online() && this.profile) {
      return this.client().rpc("spend_currency", { p_realm: this.name, p_amount: value, p_reason: reason || "spend" })
        .then(function () { self.profile[self._balanceField()] -= value; return value; })
        .catch(function (err) {
          if (err && err.status === 400) throw new Error("Not enough currency.");
          self.profile[self._balanceField()] -= value;
          return self.patch({}).then(function () { return value; });
        });
    }
    this.profile[this._balanceField()] -= value;
    this.persist();
    this.emit("profile", this.profile);
    return Promise.resolve(value);
  };

  /* ------------------------------------------------------------ inventory -- */

  Realm.prototype.loadInventory = function () {
    var self = this;
    if (this.local()) {
      this.inventory = util.storage.get(this.inventoryKey, []);
      this.emit("inventory", this.inventory);
      return Promise.resolve(this.inventory);
    }
    if (!this.profile) return Promise.resolve([]);
    return this.client().from(this.table("inventory")).select("*").eq("profile_id", this.profile.id)
      .then(function (rows) {
        self.inventory = (rows || []).map(function (r) {
          return { item_id: r.item_id, quantity: r.quantity, equipped: r.equipped };
        });
        self.emit("inventory", self.inventory);
        return self.inventory;
      })
      .catch(function () { return self.inventory; });
  };

  Realm.prototype.addToInventory = function (itemId, qty, silent) {
    var self = this;
    var amount = qty == null ? 1 : qty;
    var existing = this.inventory.filter(function (i) { return i.item_id === itemId; })[0];
    if (existing) existing.quantity += amount;
    else this.inventory.push({ item_id: itemId, quantity: amount, equipped: false });

    if (!silent) this.emit("inventory", this.inventory);
    if (!this.online() || !this.profile) {
      util.storage.set(this.inventoryKey, this.inventory);
      return Promise.resolve(amount);
    }
    var pid = this.profile.id;
    return this.client().from(this.table("inventory"))
      .upsert({ profile_id: pid, item_id: itemId, quantity: (existing ? existing.quantity : amount) }, "profile_id,item_id")
      .then(function () { return amount; })
      .catch(function () { return amount; });
  };

  Realm.prototype.quantityOf = function (itemId) {
    var row = this.inventory.filter(function (i) { return i.item_id === itemId; })[0];
    return row ? row.quantity : 0;
  };

  Realm.prototype.hasItem = function (itemId) { return this.quantityOf(itemId) > 0; };

  Realm.prototype.consume = function (itemId, qty) {
    var self = this;
    var amount = qty == null ? 1 : qty;
    var row = this.inventory.filter(function (i) { return i.item_id === itemId; })[0];
    if (!row || row.quantity < amount) return Promise.reject(new Error("You do not own that."));
    var isPerk = (X.Shop.get(itemId) || {}).type === "perk";
    if (!isPerk) row.quantity -= amount;
    this.emit("inventory", this.inventory);
    if (!this.online() || !this.profile) {
      util.storage.set(this.inventoryKey, this.inventory);
      return Promise.resolve(row.quantity);
    }
    return this.client().from(this.table("inventory"))
      .update({ quantity: row.quantity })
      .eq("profile_id", this.profile.id).eq("item_id", itemId)
      .then(function () { return row.quantity; })
      .catch(function () { return row.quantity; });
  };

  /**
   * Buy an item. Server-authoritative when online (the RPC re-checks price and
   * balance inside the transaction); validated locally otherwise.
   */
  Realm.prototype.purchase = function (itemId) {
    var self = this;
    var item = X.Shop.get(itemId);
    if (!item) return Promise.reject(new Error("Unknown item."));
    if (item.realm !== (this.name === "multi" ? "multi" : "single")) {
      return Promise.reject(new Error("That item belongs to the other realm."));
    }
    var owned = this.quantityOf(itemId);
    if (item.stack === 1 && owned > 0) return Promise.reject(new Error("You already own that."));

    if (this.online() && this.profile) {
      return this.client().rpc("purchase_item", { p_item_id: itemId })
        .then(function (res) {
          return self.loadInventory().then(function () {
            self.profile[self._balanceField()] = res && res.balance != null ? res.balance : self.profile[self._balanceField()];
            self.profile.spent = (self.profile.spent || 0) + item.price;
            self.emit("profile", self.profile);
            return res || { balance: self.balance() };
          });
        });
    }

    if (item.price > this.balance()) return Promise.reject(new Error("Not enough " + (this.name === "multi" ? "cores" : "shards") + "."));
    this.profile[this._balanceField()] -= item.price;
    this.profile.spent = (this.profile.spent || 0) + item.price;
    this.profile.owned = (this.profile.owned || 0) + (this.quantityOf(itemId) === 0 ? 1 : 0);
    this.persist();
    return this.addToInventory(itemId, 1, true).then(function () {
      self.emit("profile", self.profile);
      self.emit("inventory", self.inventory);
      return { balance: self.balance(), item: item };
    });
  };

  Realm.prototype.equip = function (slot, value) {
    var equipped = util.merge({}, this.profile.equipped || {});
    equipped[slot] = equipped[slot] === value ? null : value;
    return this.patch({ equipped: equipped });
  };

  /* ------------------------------------------------------------- history -- */

  Realm.prototype.loadHistory = function (limit) {
    var self = this;
    if (this.local()) {
      this.history = util.storage.get(this.historyKey, []);
      return Promise.resolve(this.history.slice(0, limit || 50));
    }
    if (!this.profile) return Promise.resolve([]);
    return this.client().from(this.table("history")).select("*")
      .eq("profile_id", this.profile.id)
      .order("created_at", { ascending: false })
      .limit(limit || 50)
      .then(function (rows) {
        self.history = rows || [];
        return self.history;
      })
      .catch(function () { return self.history; });
  };

  Realm.prototype.record = function (entry) {
    var self = this;
    var row = util.merge({ id: util.uid("h"), created_at: Date.now() }, entry);
    this.history.unshift(row);
    this.history = this.history.slice(0, 100);
    if (this.local()) {
      util.storage.set(this.historyKey, this.history);
      return Promise.resolve(row);
    }
    if (!this.profile) return Promise.resolve(row);
    var payload = util.merge({ profile_id: this.profile.id }, entry);
    return this.client().from(this.table("history")).insert(payload)
      .then(function () { return row; })
      .catch(function () { return row; });
  };

  /* -------------------------------------------------------------- runs ---- */

  Realm.prototype.saveRun = function (run) {
    var snap = util.clone(run);
    snap.savedAt = Date.now();
    if (this.local()) {
      util.storage.set(this.runKey, snap);
      return Promise.resolve(snap);
    }
    if (!this.profile) return Promise.resolve(snap);
    return this.client().from(this.table("runs"))
      .upsert({ profile_id: this.profile.id, state: snap, updated_at: new Date().toISOString() }, "profile_id")
      .then(function () { return snap; })
      .catch(function () { return snap; });
  };

  Realm.prototype.loadRun = function () {
    var self = this;
    if (this.local()) return Promise.resolve(util.storage.get(this.runKey, null));
    if (!this.profile) return Promise.resolve(null);
    return this.client().from(this.table("runs")).select("state")
      .eq("profile_id", this.profile.id).maybeSingle()
      .then(function (row) { return row ? row.state : null; })
      .catch(function () { return util.storage.get(self.runKey, null); });
  };

  Realm.prototype.clearRun = function () {
    if (this.local()) { util.storage.remove(this.runKey); return Promise.resolve(); }
    if (!this.profile) return Promise.resolve();
    return this.client().from(this.table("runs")).delete().eq("profile_id", this.profile.id)
      .then(function () { return undefined; }).catch(function () { return undefined; });
  };

  /* -------------------------------------------------------- leaderboard --- */

  Realm.prototype.leaderboard = function (metric, limit) {
    var self = this;
    var col = metric || (this.name === "multi" ? "elo" : "total_score");
    if (this.local()) {
      var me = this.profile ? {
        id: this.profile.id,
        username: this.profile.display_name || this.profile.username || "You",
        value: this.profile[col] || 0,
        level: this.profile.level,
        avatar_seed: this.profile.avatar_seed
      } : null;
      return Promise.resolve(me ? [me] : []);
    }
    return this.client().from(this.table("profiles"))
      .select("id,username,display_name,level,avatar_seed," + col)
      .order(col, { ascending: false })
      .limit(limit || 50)
      .then(function (rows) {
        return (rows || []).map(function (r) {
          return {
            id: r.id,
            username: r.display_name || r.username || "Cipher",
            value: r[col] || 0,
            level: r.level || 1,
            avatar_seed: r.avatar_seed
          };
        });
      })
      .catch(function () { return []; });
  };

  Realm.prototype.myPosition = function (metric) {
    var self = this;
    var col = metric || (this.name === "multi" ? "elo" : "total_score");
    if (this.local() || !this.profile) return Promise.resolve(this.profile ? 1 : null);
    var mine = this.profile[col] || 0;
    return this.client().from(this.table("profiles")).select("id", { count: "exact", head: true })
      .gt(col, mine)
      .then(function (res) { return (res && res.count != null ? res.count : 0) + 1; })
      .catch(function () { return null; });
  };

  /* ----------------------------------------------------------- auth ------- */

  Realm.prototype.signUp = function (creds) {
    var self = this;
    return this.client().signUp(util.merge({}, creds, {
      data: { realm: this.name, username: creds.username }
    })).then(function (res) {
      if (res && res.pending) return res;
      return self.ensure().then(function () { return res; });
    });
  };

  Realm.prototype.signIn = function (creds) {
    var self = this;
    return this.client().signIn(creds).then(function (res) {
      return self.ensure().then(function () { return res; });
    });
  };

  Realm.prototype.signOut = function () {
    var self = this;
    return this.client().signOut().then(function () {
      self.profile = null;
      self.inventory = [];
      self.emit("profile", null);
    });
  };

  Realm.prototype.isSignedIn = function () {
    return this.local() ? true : this.client().isSignedIn();
  };

  Realm.prototype.accountLabel = function () {
    if (this.local()) return "Local vault";
    var u = this.client().user();
    return u ? u.email : "Guest";
  };

  /* ------------------------------------------------------------- rooms ---- */

  function makeCode() {
    var alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    var out = "";
    for (var i = 0; i < 5; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
    return out;
  }

  Realm.prototype.rooms = {
    list: function () {
      if (!CFG.isCloudReady()) return Promise.resolve([]);
      return X.SBm.from("mp_rooms")
        .select("id,code,host_id,host_name,mode,tier,ranked,status,player_count,max_players,created_at")
        .eq("status", "open")
        .order("created_at", { ascending: false })
        .limit(40)
        .catch(function () { return []; });
    },
    create: function (opts) {
      var o = opts || {};
      if (!CFG.isCloudReady()) return Promise.reject(new Error("Multiplayer rooms run on Supabase. Connect it in Settings."));
      var code = o.code || makeCode();
      var mode = CFG.mode(o.mode);
      var row = {
        code: code,
        host_id: o.hostId,
        host_name: o.hostName,
        mode: mode.id,
        tier: o.tier || CFG.get("defaultTier"),
        ranked: !!o.ranked,
        status: "open",
        max_players: mode.maxPlayers,
        player_count: 1,
        seed: o.seed || util.uid("seed"),
        state: { startedAt: null, endsAt: null, code: null, puzzles: [] }
      };
      return X.SBm.from("mp_rooms").insert(row).select("*").single();
    },
    byCode: function (code) {
      var clean = String(code || "").trim().toUpperCase();
      return X.SBm.from("mp_rooms").select("*").eq("code", clean).eq("status", "open").maybeSingle();
    },
    byId: function (id) {
      return X.SBm.from("mp_rooms").select("*").eq("id", id).maybeSingle();
    },
    update: function (id, patch) {
      return X.SBm.from("mp_rooms").update(patch).eq("id", id);
    },
    close: function (id) {
      return X.SBm.from("mp_rooms").update({ status: "closed" }).eq("id", id);
    },
    players: function (roomId) {
      return X.SBm.from("mp_room_players").select("*").eq("room_id", roomId)
        .order("joined_at", { ascending: true })
        .catch(function () { return []; });
    },
    join: function (roomId, player) {
      return X.SBm.from("mp_room_players").upsert(util.merge({ room_id: roomId }, player), "room_id,profile_id")
        .select("*").single();
    },
    updatePlayer: function (roomId, profileId, patch) {
      return X.SBm.from("mp_room_players").update(patch).eq("room_id", roomId).eq("profile_id", profileId);
    },
    leave: function (roomId, profileId) {
      return X.SBm.from("mp_room_players").delete().eq("room_id", roomId).eq("profile_id", profileId);
    },
    events: function (roomId, limit) {
      return X.SBm.from("mp_room_events").select("*").eq("room_id", roomId)
        .order("created_at", { ascending: true }).limit(limit || 80)
        .catch(function () { return []; });
    },
    push: function (roomId, kind, profileId, payload) {
      return X.SBm.from("mp_room_events").insert({ room_id: roomId, kind: kind, profile_id: profileId, payload: payload || {} });
    },
    chat: function (roomId, limit) {
      return X.SBm.from("mp_chat").select("*").eq("room_id", roomId)
        .order("created_at", { ascending: true }).limit(limit || 60)
        .catch(function () { return []; });
    },
    say: function (roomId, profileId, name, body) {
      return X.SBm.from("mp_chat").insert({ room_id: roomId, profile_id: profileId, name: name, body: body });
    },
    submitResult: function (roomId, result) {
      return X.SBm.from("mp_results").insert(util.merge({ room_id: roomId }, result));
    }
  };

  /* -------------------------------------------------------------- factory -- */

  var CLOUD = {
    realms: { single: new Realm("single"), multi: new Realm("multi") },
    initialized: false,

    realm: function (name) { return this.realms[name === "multi" ? "multi" : "single"]; },

    init: function () {
      var url = CFG.get("supabaseUrl");
      var key = CFG.get("supabaseAnonKey");
      X.SB.configure(url, key);
      X.SBm.configure(url, key);
      this.initialized = true;
      return Promise.all([this.realms.single.init(), this.realms.multi.init()]);
    },

    /** Re-configure after the player pastes credentials into Settings. */
    reconfigure: function (url, key) {
      CFG.update({ supabaseUrl: url, supabaseAnonKey: key });
      X.Realtime.closeAll();
      return this.init();
    },

    online: function () { return CFG.isCloudReady(); },

    health: function () {
      var self = this;
      if (!this.online()) {
        return Promise.resolve({ mode: "local", ok: true, note: "Playing against the local vault." });
      }
      var started = Date.now();
      return X.SB.from("sp_profiles").select("id", { count: "exact", head: true }).limit(1)
        .then(function () {
          return { mode: "cloud", ok: true, latency: Date.now() - started };
        })
        .catch(function (err) {
          return { mode: "cloud", ok: false, error: err.message, latency: Date.now() - started, self: self };
        });
    }
  };

  X.Cloud = CLOUD;
  X.Realm = Realm;
})(window);
