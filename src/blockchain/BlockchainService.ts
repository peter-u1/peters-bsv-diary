import WalletService from "./WalletService";
import type { Entry } from "../types/Entry";
import type { PDPv1 } from "../types/PDP";

class BlockchainService {

    private toPDP(entry: Entry): PDPv1 {

        return {

            app: "PeterDiary",

            protocol: "PDP",

            version: 1,

            entry: {

                id: entry.id,

                createdAt: entry.createdAt,

                updatedAt: entry.updatedAt,

                content: entry.text

            }

        };

    }

    async save(entry: Entry) {

        const pdp = this.toPDP(entry);

        return WalletService.createDiaryTransaction(
            JSON.stringify(pdp)
        );

    }

}

export default new BlockchainService();