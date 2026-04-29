import { createMachine } from 'xstate';

export const listingMachine = createMachine({
    id: 'listing',
    initial: 'draft',
    states: {
        draft: {
            on: {
                SUBMIT_FOR_REVIEW: 'under_review'
            }
        },
        under_review: {
            on: {
                ADMIN_APPROVE: 'published',
                ADMIN_REJECT: 'rejected'
            }
        },
        rejected: {
            on: {
                EDIT_AND_RESUBMIT: 'draft'
            }
        },
        published: {
            on: {
                START_OPERATION: 'in_operation'
            }
        },
        in_operation: {
            on: {
                OPERATION_CANCELLED: 'published',
                OPERATION_COMPLETED: 'sold'
            }
        },
        sold: {
            type: 'final'
        }
    }
});
