import { Service, Inject } from 'typedi';
import { Pool } from 'pg';

@Service('txoutModel')
class TxoutModel {
  constructor(@Inject('db') private db: Pool) {}

  public async getTxoutByScriptHash(scripthash: string, offset: number, limit: number, script?: boolean, unspent?: boolean): Promise<string> {
    let result: any;
    let split = scripthash.split(',');
    let q = `
    SELECT txout.txid, txout.index, txout.address, txout.scripthash, txout.satoshis, txout.spend_txid, txout.spend_index, tx.status
    ${script ? ', txout.script ' : ''}
    FROM txout, tx
    WHERE scripthash IN (${this.joinQuote(split)})
    ${ unspent ? 'AND spend_txid IS NULL ' : '' }
    AND txout.txid = tx.txid
    OFFSET $1
    LIMIT $2`;
    result = await this.db.query(q, [ offset, limit ]);
    return result.rows;
  }

  public async getTxoutByAddress(address: string, offset: number, limit: number, script?: boolean, unspent?: boolean): Promise<string> {
    let result: any;
    let split = address.split(',');
    let q = `
    SELECT txout.txid, txout.index, txout.address, txout.scripthash, txout.satoshis, txout.spend_txid, txout.spend_index, tx.status
    ${script ? ', txout.script ' : ''}
    FROM txout, tx
    WHERE address IN (${this.joinQuote(split)})
    ${ unspent ? 'AND spend_txid IS NULL ' : '' }
    AND txout.txid = tx.txid
    OFFSET $1
    LIMIT $2`;
    result = await this.db.query(q, [ offset, limit ]);
    return result.rows;
  }

  /**
   * Todo: Refactor to not repeat queries
   */
  public async getTxoutsByGroup(params: { groupname: string, script?: boolean, limit: any, offset: any, unspent?: boolean}): Promise<any> {
    let result: any;
    let q = `
    SELECT txout.txid, txout.index, txout.address, txout.scripthash, txout.satoshis, txout.spend_txid, txout.spend_index, tx.status
    ${params.script ? ', txout.script ' : ''}
    FROM txout, txoutgroup, tx
    WHERE
    txoutgroup.groupname = $1 AND
    (
      txoutgroup.scriptid = txout.address OR
      txoutgroup.scriptid = txout.scripthash
    ) AND
    ${ params.unspent ? ' spend_txid IS NULL AND ' : '' }
    tx.txid = txout.txid
    OFFSET $2
    LIMIT $3`;

    result = await this.db.query(q, [ params.groupname, params.offset, params.limit ]);
    return result.rows;
  }

  public async getUtxoBalanceByScriptHashes(scripthashes: string[]): Promise<any> {
    let result: any;
    const str = `
      SELECT * FROM
      (
        SELECT sum(satoshis) as balance
        FROM txout, tx
        WHERE
        txout.scripthash IN (${this.joinQuote(scripthashes)}) AND
        spend_txid IS NULL AND
        txout.txid = tx.txid AND
        tx.completed IS TRUE

        UNION

        SELECT sum(satoshis) as balance
        FROM txout, tx
        WHERE
        txout.scripthash IN (${this.joinQuote(scripthashes)}) AND
        spend_txid IS NULL AND
        txout.txid = tx.txid AND
        tx.completed IS FALSE

      ) AS q1
    `;
    result = await this.db.query(str);
    let balance = {
      confirmed: result.rows[0].balance ? Number(result.rows[0].balance) : 0,
      unconfirmed: result.rows[1] && result.rows[1].balance ? Number(result.rows[1].balance) : 0,
    }
    return balance;
  }

  public async getUtxoBalanceByAddresses(addresses: string[]): Promise<any> {
    let result: any;
    const str = `
      SELECT * FROM
      (
        SELECT sum(satoshis) as balance
        FROM txout, tx
        WHERE
        txout.address IN (${this.joinQuote(addresses)}) AND
        spend_txid IS NULL AND
        txout.txid = tx.txid AND
        tx.completed IS TRUE

        UNION

        SELECT sum(satoshis) as balance
        FROM txout, tx
        WHERE
        txout.address IN (${this.joinQuote(addresses)}) AND
        spend_txid IS NULL AND
        txout.txid = tx.txid AND
        tx.completed IS FALSE

      ) AS q1
    `;
    result = await this.db.query(str);
    let balance = {
      confirmed: result.rows[0].balance ? Number(result.rows[0].balance) : 0,
      unconfirmed: result.rows[1] && result.rows[1].balance ? Number(result.rows[1].balance) : 0,
    }
    return balance;
  }

  /**
   * Todo: Refactor to not repeat queries
   */
  public async getUtxoBalanceByGroup(groupname: string): Promise<any> {
    let result: any;
    const str = `
      SELECT * FROM
      (
        SELECT sum(satoshis) as balance
        FROM txout, txoutgroup, tx
        WHERE
        txoutgroup.groupname = $1 AND
        (
          txoutgroup.scriptid = txout.address OR
          txoutgroup.scriptid = txout.scripthash
        ) AND
        spend_txid IS NULL AND
        txout.txid = tx.txid AND
        tx.completed IS TRUE

        UNION

        SELECT sum(satoshis) as balance
        FROM txout, txoutgroup, tx
        WHERE
        txoutgroup.groupname = $2 AND
        (
          txoutgroup.scriptid = txout.address OR
          txoutgroup.scriptid = txout.scripthash
        ) AND
        spend_txid IS NULL AND
        txout.txid = tx.txid AND
        tx.completed IS FALSE

      ) AS q1
    `;
    result = await this.db.query(str, [ groupname, groupname ]);
    let balance = {
      confirmed: result.rows[0].balance ? Number(result.rows[0].balance) : 0,
      unconfirmed: result.rows[1] && result.rows[1].balance ? Number(result.rows[1].balance) : 0,
    }
    return balance;
  }

  public async getTxout(txid: string, index: number, script?: boolean): Promise<string> {
    let result: any = await this.db.query(`
    SELECT txout.txid, txout.index, txout.address, txout.scripthash, txout.satoshis, txout.spend_txid, txout.spend_index, tx.status
    ${script ? ', txout.script ' : ''}
    FROM txout, tx
    WHERE txout.txid = $1 AND
    txout.index = $2 AND
    tx.txid = txout.txid`, [
      txid, index
    ]);
    return result.rows[0];
  }

  public async getTxoutsByOutpointArray(txOutpoints: Array<{ txid: string, index: string }>, script?: boolean): Promise<any[]> {
    const txidToIndexMap = {};
    const txidsOnly = [];
    // tslint:disable-next-line: prefer-for-of
    for (let index = 0; index < txOutpoints.length; index++) {
      txidToIndexMap[txOutpoints[index].txid] = txidToIndexMap[txOutpoints[index].txid] || {};
      txidToIndexMap[txOutpoints[index].txid][txOutpoints[index].index] = true;
      txidsOnly.push(txOutpoints[index].txid);
    }
    let result = await this.db.query(`
    SELECT txout.txid, txout.index, txout.address, txout.scripthash, txout.satoshis, txout.spend_txid, txout.spend_index, tx.status
    ${script ? ', txout.script ' : ''}
    FROM txout, tx
    WHERE txout.txid IN(${this.joinQuote(txidsOnly)}) AND tx.txid = txout.txid`);

    const results = [];
    // Walk the results and only keep the txouts that match txid+index
    for (const row of result.rows) {
      if (txidToIndexMap[row.txid]) {
        if (txidToIndexMap[row.txid][row.index]) {
          results.push(row);
        }
      }
    }
    return results;
  }

  public async saveTxout(txid: string, index: number, address: string | null | undefined, scripthash: string, script: string, satoshis: number): Promise<string> {
    let result: any = await this.db.query(
      `INSERT INTO txout(txid, index, address, scripthash, script, satoshis)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT DO NOTHING`, [
        txid, index, address, scripthash, script, satoshis
      ]);
    return result;
  }

  public async updateSpendIndex(
    txid: string, index: string, spendTxId: string, spendIndex: number
  ) {
    let result: any = await this.db.query(
      `UPDATE txout
      SET spend_txid=$1, spend_index=$2
      WHERE txid=$3 AND index=$4`, [
        spendTxId, spendIndex, txid, index
      ]);
    return result;
  }

  private joinQuote(arr: string[]): string {
    return "'" + arr.join("','") + "'";
  }

}

export default TxoutModel;
