#!/usr/bin/env python 

"""

The input task (json string) is read on stdin:
{
    user, name, status, input, output, childrenCompleted, childrenTotal # to use later
    tempInput | childrenArray
}

The output task (json string) is written on stdout:
{
    tempOutput | childrenArray
}

"""

import json 
import sys
import time

data = sys.stdin.readlines()
json_input = json.loads(data[0])

split = True
n_split = 1

if ("tempInput" in json_input):
    with open(json_input["tempInput"], 'r') as f:
        content = f.readlines()
        n_split = len(content)
        print(content, file=sys.stderr)

merge = ("childrenCompleted" in json_input and "childrenTotal" in json_input) \
    and json_input["childrenCompleted"] == json_input["childrenTotal"]
split = (n_split > 1)

# ------------------------------------------------------------------------------
# Mode 1 => If child exists, merge document into a single one
# ------------------------------------------------------------------------------
if (merge):
    print("MERGE MODE PYTHON ", file=sys.stderr)
    json_output = json_input
    tempOutputName = json_input["childrenArray"][0]["tempInput"].split('.')[0] + ".out"
    json_output["tempOutput"] = tempOutputName
    tempOutput = open(tempOutputName, 'w')
    
    for child in json_input["childrenArray"]:
        tempInput = open(child["tempInput"], 'r')
        content = tempInput.readline()
        print("content " + content, file=sys.stderr)
        tempOutput.write(content)
        tempInput.close()

    tempOutput.close()

# ------------------------------------------------------------------------------
# Mode 2 => If document too big, split it into parts
# ------------------------------------------------------------------------------
elif (split):
    print("SPLIT MODE PYTHON", file=sys.stderr)
    json_output = json_input
    json_output["childrenArray"] = []

    name = json_input["tempInput"].split(".")[0]

    with open(json_input["tempInput"], 'r') as f:
        for index, line in enumerate(f.readlines()):
            childTempOutputName = "{}.{}.part.out".format(name, str(index))
            json_output["childrenArray"].append({
                "tempOutput": childTempOutputName
            })
            with open(childTempOutputName, 'w') as f:
                f.write(line)

# ------------------------------------------------------------------------------
# Mode 3 => If normal condition, processing of the document and output it in local
# ------------------------------------------------------------------------------
else:
    print("NORMAL MODE PYTHON", file=sys.stderr)
    json_output = json_input

    tempInput = open(json_input["tempInput"], 'r')
    tempOutputName = json_input["tempInput"].split('.')[0] + ".out"
    json_output["tempOutput"] = tempOutputName
    tempOutput = open(tempOutputName, 'w')

    for line in tempInput:
        tempOutput.write("out:" + line)

    tempInput.close()
    tempOutput.close()

# Write result in stdout
print("{}".format(json.dumps(json_output)))
