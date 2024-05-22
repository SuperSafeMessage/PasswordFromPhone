package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sync"
	"time"
)

type messageData struct {
	Value    *string
	Listener func(string)
	lock     sync.Mutex
}

var (
	messages             sync.Map
	lastUpdatedTimestamp int64 = 0
)

func callListener(listener func(string), value string) {
	defer func() {
		if r := recover(); r != nil {
			fmt.Println("Recovered from panic:", r)
		}
	}()
	listener(value)
}

func setMessage(key string, value string) {
	lastUpdatedTimestamp = time.Now().Unix()

	existing, loaded := messages.LoadOrStore(key, &messageData{
		Value:    &value,
		Listener: nil,
	})
	if loaded {
		msgData := existing.(*messageData)
		msgData.lock.Lock()
		defer msgData.lock.Unlock()
		if msgData.Listener != nil {
			callListener(msgData.Listener, value)
			msgData.Listener = nil // 清掉监听者
		}
		msgData.Value = &value
	}
}

func waitForMessage(key string) *string {
	lastUpdatedTimestamp = time.Now().Unix()

	ch := make(chan string, 1)

	listener := func(value string) {
		ch <- value
	}

	existing, loaded := messages.LoadOrStore(key, &messageData{
		Value:    nil,
		Listener: listener,
	})
	if loaded {
		value := func() *string {
			msgData := existing.(*messageData)
			msgData.lock.Lock()
			defer msgData.lock.Unlock()

			if msgData.Value != nil {
				value := msgData.Value
				msgData.Value = nil
				return value
			}
			msgData.Listener = listener
			return nil
		}()
		if value != nil {
			return value
		}
	}
	select {
	case value := <-ch:
		return &value
	case <-time.After(30 * time.Second):
		return nil
	}
}

func send(w http.ResponseWriter, req *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS, PUT, DELETE")
	receiver := req.URL.Query()["receiver"][0]
	var message string
	switch req.Method {
	case "GET":
		message = req.URL.Query()["message"][0]
	case "POST":
		body, err := io.ReadAll(req.Body)
		if err != nil {
			return
		}
		defer req.Body.Close()
		message = string(body)
	}

	if len(message) > 256*1024 {
		return
	}
	setMessage(receiver, message)
	fmt.Fprintf(w, "ok")
}

func receive(w http.ResponseWriter, req *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS, PUT, DELETE")
	receiver := req.URL.Query()["receiver"][0]
	message := waitForMessage(receiver)
	b, _ := json.Marshal(message)
	w.Write(b)
}

func main() {

	go func() {
		for {
			time.Sleep(10 * time.Minute)
			if time.Now().Unix()-lastUpdatedTimestamp > 10*60 {
				messages = sync.Map{}
			}
		}
	}()

	http.HandleFunc("/receive", receive)
	http.HandleFunc("/send", send)
	panic(http.ListenAndServe(":8091", nil))
}
