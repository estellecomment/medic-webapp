var _ = require('underscore'),
    utils = require('./utils'),
    kutils = require('kujua-utils'),
    appinfo = require('views/lib/appinfo');

var json_headers = {
    'Content-Type': 'application/json; charset=utf-8'
};

/*
 * Respond to smssync task polling, callback does a bulk update to update the
 * state field of tasks.
 */
exports.tasks_pending = function (head, req) {
    start({code: 200, headers: json_headers});

    var newDocs = [],
        appdb = require('duality/core').getDBURL(req),
        headers = req.headers.Host.split(":"),
        includeDoc,
        host = headers[0],
        port = headers[1] || "",
        row,
        doc;

    var respBody = {
        payload: {
            success: true,
            task: "send",
            secret: "",
            messages: []
        }
    };

    while (row = getRow()) {
        doc = row.doc;

        // update state attribute for the bulk update callback
        // don't process tasks that have no `to` field since we can't send a
        // message and we don't want to mark the task as sent.  TODO have
        // better support in the gateway for tasks so the gateway can verify
        // that it processed the task successfully.
        includeDoc = false;
        _.each(doc.tasks, function(task) {
            if (task.state === 'pending') {
                _.each(task.messages, function(msg) {
                    // if to and message is defined then append messages
                    if (msg.to && msg.message) {
                        kutils.setTaskState(task, 'sent');
                        task.timestamp = new Date().toISOString();
                        // append outgoing message data payload for smsssync
                        respBody.payload.messages.push(msg);
                        includeDoc = true;
                    }
                });
            }
        });

        // only process scheduled tasks if doc has no errors.
        if (!doc.errors || doc.errors.length === 0) {
            _.each(doc.scheduled_tasks || [], function(task) {
                if (task.state === 'pending') {
                    _.each(task.messages, function(msg) {
                        // if to and message is defined then append messages
                        if (msg.to && msg.message) {
                            kutils.setTaskState(task, 'sent');
                            task.timestamp = new Date().toISOString();
                            // append outgoing message data payload for smsssync
                            respBody.payload.messages.push(msg);
                            includeDoc = true;
                        }
                    });
                }
            });
        }

        if (includeDoc) {
            newDocs.push(doc);
        }
    }

    if (newDocs.length) {
        respBody.callback = {
            options: {
                host: host,
                port: port,
                path: appdb + '/_bulk_docs',
                method: "POST",
                headers: json_headers},
            // bulk update
            data: {docs: newDocs}
        };
    }

    // pass through Authorization header
    if(req.headers.Authorization && respBody.callback) {
        respBody.callback.options.headers.Authorization = req.headers.Authorization;
    }

    return JSON.stringify(respBody);
};

exports.facilities_select2 = function(head, req) {
    start({code: 200, headers: {
        'Content-Type': 'text/json; charset=utf-8'
    }});

    row = getRow();

    if (!row) {
        return send('[]');
    }

    function getData() {
        var names = [],
            //support include_docs=true
            doc = row.doc || row.value;

        if (doc.name) {
            names.unshift(doc.name);
            if (doc.parent && doc.parent.name) {
                names.unshift(doc.parent.name);
                if (doc.parent.parent && doc.parent.parent.name) {
                    names.unshift(doc.parent.parent.name);
                }
            }
        }

        return {
            text: names.join(', '),
            id: row.id
        };
    }

    // create array of facilities as valid JSON output, no comma at end.  also
    // format nicely incase someone wants to modify it and re-upload.
    send('[');
    send(JSON.stringify(getData()));
    while (row = getRow()) {
        send(',\n');
        send(JSON.stringify(getData()));
    }
    send(']');

};

exports.duplicate_form_submissions_with_count = function (head, req) {
    start({code: 200, headers: {
        'Content-Type': 'text/json;charset=utf-8'
    }});

    var row;
    var first_element = true;

    send('[');
    while (row = getRow()) {
        if (row.value > 1) {
            var delimiter = first_element ? '' : ',';
            send(delimiter + JSON.stringify({key: row.key, count: row.value}));
            first_element = false;
        }
    }
    send(']');
};

exports.duplicate_individual_form_submissions = function (head, req) {
    start({code: 200, headers: {
        'Content-Type': 'text/json;charset=utf-8'
    }});

    var row;
    var original_submission = [];
    var first_element = true;

    send('{"duplicates":[');
    while (row = getRow()) {
        if (original_submission.indexOf(JSON.stringify(row.key)) == -1) {
            original_submission.push(JSON.stringify(row.key));
        }
        else {
            var delimiter = first_element ? '' : ',';
            send(delimiter + JSON.stringify({'key': row.key, 'id': row.id, 'rev': row.value}));
            first_element = false;
        }
    }
    send(']}');
};