// contabilidad de mánagers: la forma que consume el dashboard.

export interface ManagerCash {
	managerId: string;
	name: string;
	cash: number;
	teamValue: number;
	/** poder de puja = cash + 25% del valor de plantilla */
	maxBid: number;
	clauseSpend: number;
	pendingBids: number;
	/** true si la fila viene del saldo real y no de la estimación */
	exact: boolean;
}

export interface TransferRecord {
	id: number;
	playerId: string;
	playerName: string;
	from: string | null;
	to: string | null;
	price: number;
	kind: 'market' | 'clause' | 'loan';
	occurredAt: number | null;
}
