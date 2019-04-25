import os
import datetime

# INFORMATION
#
# Usage: 
#   - hbase shell ./clear.hbase
#   - hbase shell ./generate.hbase

path = (os.path.dirname(os.path.realpath(__file__)))
n = 100 # included
base_table = "taskP"
row_family = "data"

def clear(n):
    output = ""
    for i in range(n+1):
        output += "disable '{}{:04d}'\n".format(base_table, i)
        output += "drop '{}{:04d}'\n".format(base_table, i)
    output += "list\n"
    output += "exit\n"
    return output

def generate(n):
    output = ""
    for i in range(n+1):
        output += "create '{}{:04d}', '{}'\n".format(base_table, i, row_family)
    output += "list\n"
    output += "exit\n"
    return output

def billing():
    now = datetime.datetime.now()
    now2d = datetime.datetime.now() - datetime.timedelta(days=1)
    now10d = datetime.datetime.now() - datetime.timedelta(days=10)
    output = ""
    output += "disable 'taskBilling'\n"
    output += "drop 'taskBilling'\n"
    output += "create 'taskBilling', 'data'\n"
    for i in range(10):
        date = datetime.datetime.now() - datetime.timedelta(seconds=22*i)
        output += "put 'taskBilling', '{}{}{}', 'data:nbPages', '{}'\n".format(date.isoformat(), "#AA",str(i), str(i))
        output += "put 'taskBilling', '{}{}{}', 'data:user', 'user'\n".format(date.isoformat(), "#AA",str(i))
        output += "put 'taskBilling', '{}{}{}', 'data:name', 'name'\n".format(date.isoformat(), "#AA",str(i))
        output += "put 'taskBilling', '{}{}{}', 'data:status', 'output'\n".format(date.isoformat(), "#AA",str(i))
        output += "put 'taskBilling', '{}{}{}', 'data:output', 'output.out'\n".format(date.isoformat(), "#AA",str(i))
    """
    output += "put 'taskBilling', '{}{}', 'data:nbPages', '{}'\n".format(now.isoformat(), "#AA", "10")
    output += "put 'taskBilling', '{}{}', 'data:nbPages', '{}'\n".format(now.isoformat(), "#AB", "1")
    output += "put 'taskBilling', '{}{}', 'data:nbPages', '{}'\n".format(now.isoformat(), "#AC", "2")
    output += "put 'taskBilling', '{}{}', 'data:nbPages', '{}'\n".format(now2d.isoformat(), "#BA", "10")
    output += "put 'taskBilling', '{}{}', 'data:nbPages', '{}'\n".format(now2d.isoformat(), "#BB", "10")
    output += "put 'taskBilling', '{}{}', 'data:nbPages', '{}'\n".format(now2d.isoformat(), "#BC", "10")
    output += "put 'taskBilling', '{}{}', 'data:nbPages', '{}'\n".format(now10d.isoformat(), "#CA", "10")
    output += "put 'taskBilling', '{}{}', 'data:nbPages', '{}'\n".format(now10d.isoformat(), "#CB", "10")
    output += "put 'taskBilling', '{}{}', 'data:nbPages', '{}'\n".format(now10d.isoformat(), "#CC", "10")
    """
    output += "scan 'taskBilling'\n"
    output += "exit\n"
    return output

if __name__ == "__main__":

    with open(path + "/clear.hbase", 'w') as f:
        f.write(clear(n))

    with open(path + "/generate.hbase", 'w') as f:
        f.write(generate(n))

    with open(path + "/billing.hbase", 'w') as f:
        f.write(billing())