import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * Manages WireGuard peers on a node by shelling out to `wg`.
 * Supports a DRY_RUN mode where commands are logged but not executed.
 */
export class WireGuardManager {
  /**
   * @param {object} opts
   * @param {string} opts.interfaceName
   * @param {string} opts.wgBin
   * @param {boolean} opts.dryRun
   */
  constructor({ interfaceName = "wg0", wgBin = "wg", dryRun = false } = {}) {
    this.interfaceName = interfaceName;
    this.wgBin = wgBin;
    this.dryRun = dryRun;
  }

  /**
   * Adds (or updates) a peer on the interface.
   * @param {string} publicKey
   * @param {string} allowedIPs e.g. "10.77.0.2/32"
   */
  async upsertPeer(publicKey, allowedIPs) {
    const args = ["set", this.interfaceName, "peer", publicKey, "allowed-ips", allowedIPs];
    return this._run(args);
  }

  /** Removes a peer from the interface. */
  async removePeer(publicKey) {
    const args = ["set", this.interfaceName, "peer", publicKey, "remove"];
    return this._run(args);
  }

  /** Returns the server's public key, or null on failure. */
  async serverPublicKey() {
    try {
      const { stdout } = await execFileAsync(this.wgBin, ["show", this.interfaceName, "public-key"]);
      return stdout.trim();
    } catch {
      return null;
    }
  }

  async _run(args) {
    if (this.dryRun) {
      console.log(`[dry-run] ${this.wgBin} ${args.join(" ")}`);
      return;
    }
    await execFileAsync(this.wgBin, args);
  }
}
