#/bin/sh

f_curator() {
    echo "\
================================================================================\n\
EXECUTION OF ELASTICSEARCH CURATOR\n\
================================================================================"
    HOST="http://localhost:9200"
    INDICES=$(curl -s -XGET $HOST/_cat/indices | awk '{print $3}')
    NOW=$(date +%s)

    for INDEX in $INDICES
    do
    if [[ $INDEX =~ (onv_ocr_api-)([0-9.]*) ]]; then
        DATE=$(date -juf '%Y.%m.%d.%H' ${BASH_REMATCH[2]} "+%s")
        if [ "$((NOW-DATE))" -ge 21600 ]; then # that means 6 hours
            echo "Delete index $INDEX ..."
            curl -s -XDELETE $HOST/$INDEX
            else
            echo "Index $INDEX skipped ..."
        fi
    else 
        echo "Index $INDEX skipped ...";
    fi
    done
}

f_curator

# for cron add (hourly job)
# 0 * * * * script.sh