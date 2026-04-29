import { UniqueEntityID } from '../value-objects/UniqueEntityID';

export interface IDomainEvent {
    dateTimeOccurred: Date;
    getAggregateId(): UniqueEntityID;
}

export class DomainEvents {
    private static handlersMap: { [eventName: string]: any[] } = {};
    private static markedAggregates: any[] = [];

    public static markAggregateForDispatch(aggregate: any): void {
        const aggregateFound = !!this.findMarkedAggregateByID(aggregate.id);
        if (!aggregateFound) {
            this.markedAggregates.push(aggregate);
        }
    }

    private static findMarkedAggregateByID(id: UniqueEntityID): any {
        let found = null;
        for (let aggregate of this.markedAggregates) {
            if (aggregate.id.equals(id)) {
                found = aggregate;
            }
        }
        return found;
    }
}
