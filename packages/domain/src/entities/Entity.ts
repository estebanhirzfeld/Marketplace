import { UniqueEntityID } from '../value-objects/UniqueEntityID';

export abstract class Entity<T> {
    protected readonly _id: UniqueEntityID;
    protected readonly _createdAt: Date;
    protected props: T;

    constructor(props: T, id?: UniqueEntityID, createdAt?: Date) {
        this._id = id ? id : new UniqueEntityID();
        this._createdAt = createdAt ? createdAt : new Date();
        this.props = props;
    }

    get id(): UniqueEntityID {
        return this._id;
    }

    get createdAt(): Date {
        return this._createdAt;
    }

    public equals(object?: Entity<T>): boolean {
        if (object == null || object == undefined) {
            return false;
        }

        if (this === object) {
            return true;
        }

        if (!(object instanceof Entity)) {
            return false;
        }

        return this._id.equals(object._id);
    }
}
