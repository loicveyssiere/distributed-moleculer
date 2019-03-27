import os

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

if __name__ == "__main__":

    with open(path + "/clear.hbase", 'w') as f:
        f.write(clear(n))

    with open(path + "/generate.hbase", 'w') as f:
        f.write(generate(n))