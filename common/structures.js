
/**
 * The smallest unit containing a string value (data) and a pointer on next element
 */
class PriorityItem {
    constructor(data) {
        this.data = data;
        this.next = null;
    }
}

/**
 * A FIFO queue implementing push and pop methods
 */
class PriorityQueue {
    constructor() {
        this.length = 0;
        this.first = null;
        this.last = null;
    }
    push(id) {
        if (this.last != null) {
            this.last.next = new PriorityItem(id);
            this.last = this.last.next;
        } else {
            this.last = new PriorityItem(id);
            this.first = this.last;
        }
        this.length++;
    }
    pop() {
        if (this.first == null) return null;
        let item = this.first.data;
        this.first = this.first.next;
        if (this.first == null) this.last = null;
        this.length--;
        return item;
    }
    merge(queue) {
        if (queue.first == null) return;
        if (this.first == null) {
            this.first = queue.first;
            this.last = queue.last;
        } else {
            this.last.next = queue.first;
        }
        queue.first = null;
        queue.last = null;
    }
    length() {
        return this.length;
    }
    isEmpty() {
        return (this.length === 0);
    }
}

/**
 * A Double-queue structure
 */
class PriorityList {
    constructor() {
        this.current = new PriorityQueue();
        this.future = new PriorityQueue();
        this.futureTime = new Date().getTime() + 5000;
        //this.isEmpty = true;
    }
    push(id, lag) {
        let q = lag ? this.future : this.current;
        q.push(id);
    }
    pop() {
        let now = new Date().getTime();
        if (now > this.futureTime) {
            // merge
            this.current.merge(this.future);
        }
        let item = this.current.pop();
        if (item == null) return null;
        // update isEmpty
        //this.isEmpty = this.current.first == null && this.future.first == null;
        //
        return item;
    }
    length() {
        return this.current.length() + this.future.length();
    }
    isEmpty() {
        return (this.current.isEmpty() && this.future.isEmpty());
    }
}

/**
 * A multiple double-queue, one per priority to discriminate by priority the elements
 */
class PriorityCache {
    constructor() {
        this.priorities = [];
        this.cache = {};
    }

    push(id, priority, lag) {
        let list = this.cache[priority];
        if (list === undefined) {
            list = new PriorityList();
            this.cache[priority] = list;
            this.priorities.push(priority);
            this.priorities.sort();
        }
        list.push(id, lag | false);
    }
    pop() {
        for (let i = this.priorities.length-1; i>=0; i--) {
            let priority = this.priorities[i];
            let list =  this.cache[priority];
            let item = list.pop();
            if (item != null) {
                if (list.isEmpty()) {
                    this.priorities.splice(i,1);
                    delete this.cache[priority];
                }
                return item;
            }
        }
        return null;
    }
    highestPriority() {
        return this.priorities[this.priorities.length-1];
    }
}

module.exports = {
    PriorityItem: PriorityItem,
    PriorityQueue: PriorityQueue,
    PriorityList: PriorityList,
    PriorityCache: PriorityCache
}