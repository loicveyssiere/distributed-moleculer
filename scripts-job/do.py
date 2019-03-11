#!/usr/bin/env python 

import json 
import sys
import time

data = sys.stdin.readlines()
json_input = json.loads(data[0])

split = True
n_split = 2
merge = ("childrenCompleted" in json_input and "childrenTotal" in json_input) \
    and json_input["childrenCompleted"] == json_input["childrenTotal"]
split = (json_input["name"] == "test-split#1")

# Mode 1 => If child exists, merge document into a single one
if (merge): # TODO: create a real merge by iterating on children
    json_output = json_input
    print("MERGE MODE PYTHON ", file=sys.stderr)
    with open(json_input["tempOutput"], 'w') as f_out:
        with open(json_input["tempInput"], 'r') as f_in:            

            for line in f_in:
                f_out.write("out:" + line)

            json_output = json_input

        #for child in json_output["children"]:
        #    with open(child["tempInput"], 'r') as f_in:
        #        for line in f_in:
        #            f_out.write("out:" + line)


# Mode 2 => If document too big, split it into parts
elif (split):
    print("SPLIT MODE PYTHON", file=sys.stderr)
    json_output = json_input
    json_output["children"] = []
    for i in range(n_split):
        input = "{}.{}.part".format(json_input["tempInput"], str(i))
        json_output["children"].append({"tempInput": input})
        with open(input, 'w') as f:
            f.write('child:test')

# Mode 3 => If normal condition, processing of the document and output it in local
else:
    print("NORMAL MODE PYTHON", file=sys.stderr)
    with open(json_input["tempOutput"], 'w') as f_out:
        with open(json_input["tempInput"], 'r') as f_in:            
    
            # compute
            #time.sleep(4.0 + 2.0*random.random())

            for line in f_in:
                f_out.write("out:" + line)

            json_output = json_input

# Write result in stdout
print("{}".format(json.dumps(json_output)))
