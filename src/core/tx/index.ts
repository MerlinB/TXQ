import { Service, Inject } from 'typedi';
import { Pool } from 'pg';
import { DateUtil } from '../../services/helpers/DateUtil';
import { ITransactionStatus } from '../../interfaces/ITransactionData';

@Service('txModel')
class TxModel {

  constructor(@Inject('db') private db: Pool) {}

  public async isTxExist(txid: string): Promise<boolean> {
    let result: any = await this.db.query(`SELECT txid FROM tx WHERE txid = $1`, [ txid ]);
    return !!result.rows[0];
  }

  public async getTx(txid: string, rawtx?: boolean): Promise<string> {
    let result: any = await this.db.query(`
      SELECT txid, ${rawtx ? 'rawtx,' : '' } h, i, send, status, completed, updated_at, created_at
      FROM tx
      WHERE txid = $1`, [ txid ]);
    return result.rows[0];
  }

  public async saveTxid(txid: string): Promise<string> {
    const now = DateUtil.now();
    let result: any = await this.db.query(`
    INSERT INTO tx(txid, updated_at, created_at, completed)
    VALUES ($1, $2, $3, false)
    ON CONFLICT DO NOTHING
    RETURNING txid`, [
      txid, now, now
    ]);
    return result;
  }

  public async saveTx(txid: string, rawtx?: string): Promise<string> {
    const now = DateUtil.now();
    let result: any = await this.db.query(`
    INSERT INTO tx(txid, rawtx, updated_at, created_at, completed)
    VALUES ($1, $2, $3, $4, false)
    ON CONFLICT(txid) DO UPDATE SET rawtx = EXCLUDED.rawtx, updated_at=EXCLUDED.updated_at
    RETURNING txid`, [
      txid, rawtx, now, now
    ]);
    return result;
  }

  public async saveTxStatus(txid: string, txStatus: ITransactionStatus, blockhash: string | null, blockheight: number | null): Promise<string> {
    const now = DateUtil.now();
    if (blockhash && blockheight) {
      let result: any = await this.db.query(`
      UPDATE tx SET status = $1, h = $2, i = $3, updated_at = $4, completed = true
      WHERE txid = $5`, [
        JSON.stringify(txStatus),
        blockhash,
        blockheight,
        now,
        txid
      ]);
      return result;
    }
    let result: any = await this.db.query(`UPDATE tx SET status = $1, updated_at = $2 WHERE txid = $3`, [ JSON.stringify(txStatus), now, txid ]);
    return result;
  }

  public async saveTxSend(txid: string, send: any): Promise<string> {
    const now = DateUtil.now();
    let result: any = await this.db.query(`UPDATE tx SET send = $1, updated_at = $2 WHERE txid = $3`, [ JSON.stringify(send), now, txid ]);
    return result;
  }

  public async updateCompleted(txid: string, completed?: boolean): Promise<string> {
    const now = DateUtil.now();
    let result: any = await this.db.query(`UPDATE tx SET updated_at = $1, completed = $2 WHERE txid = $3`, [ now, !!completed, txid ]);
    return result;
  }
}

export default TxModel;
