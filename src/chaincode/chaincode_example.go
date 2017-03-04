/*
Copyright IBM Corp. 2016 All Rights Reserved.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

		 http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

package main

import (
	"errors"
	"fmt"
	"strconv"
	"encoding/json"
	"strings"
	"time"

	"github.com/hyperledger/fabric/core/chaincode/shim"
)

// SimpleChaincode example simple Chaincode implementation
type SimpleChaincode struct {
}

var contractIndexStr = "_contractindex"		// name for key/value that will store the list of contracts,
																					// contract ID as key
var locIndexStr = "_locindex"							// name for key/value that will store the list of line of credits
																					// contract ID as key
var shipmentIndexStr = "_shipmentindex"		// name for key/value that will store the list of shipments
																					// contract ID as key
type ContractTerms struct{
	ContractID string `json:"contractID"`
	Product_Type string `json:"product"`
	Quantity_lbs int `json:"quanity_lbs"`
	Amount_dollars int `json:"amount_dollars"`
	Max_TemperatureC int `json:"maxtempC"`
	Timestamp int64 `json:"timestamp"`			//utc timestamp of creation
}

type Party struct{
	Company string `json:"company"`
	Bank		string `json:"bank"`
}

/*type LetterOfCredit struct{
	LocID				string
	ContractID	string
	Value				int
	Exporter		string
	Importer		string
	ShippingCo	string
	Customs			string
	PortOfLoad	string
	PortOfEntry string
}*/
type LetterOfCredit struct{
	LocID				string `json:"locID"`
	ContractID	string `json:"contractID"`
	Value				int `json:"value_dollars"`
	Importer		Party `json:"importer"`
	Exporter		Party `json:"exporter"`
	ShippingCo	string `json:"shipping_co"`
	Customs			string `json:"customs_auth"`
	PortOfLoading	string `json:"port_of_loading"`
	PortOfEntry string `json:"port_of_entry"`
	Timestamp int64 `json:"timestamp"`			//utc timestamp of creation
}

type Shipment struct{
	ContractID		string `json:"contractID"`
	Value					int `json:"value_dollars"`
	Cargo_TempC		int `json:"cargo_tempC"`
	ShippingCo		string `json:"shipping_co"`
	Location			string `json:"start_location"`
	ShipEvent			string `json:"ship_event"`
	Timestamp int64 `json:"timestamp"`			//utc timestamp of creation
}

var EVENT_COUNTER = "event_counter"

// ================================================================================
// Main
// ================================================================================
func main() {
	err := shim.Start(new(SimpleChaincode))
	if err != nil {
		fmt.Printf("Error starting Supply Chain chaincode: %s", err)
	}
}

// ================================================================================
// Run - Our entry point for Invocations 
// ================================================================================

func (t *SimpleChaincode) Init(stub shim.ChaincodeStubInterface, function string, args []string) ([]byte, error) {
	var User string
	var Balance int // Asset holdings
	var err error

	fmt.Printf("Called Init()\n")
	if len(args) != 2 {
		return nil, errors.New("Incorrect number of arguments. Expecting 1")
	}

	// Initialize the chaincode
	User = args[0];
	Balance, err = strconv.Atoi(args[1]);
	if err != nil {
		return nil, errors.New("Expecting integer value for asset holding")
	}

	fmt.Printf("Initializing %s with balance %d\n", User, Balance)

	// Write the state to the ledger
	err = stub.PutState(User, []byte(strconv.Itoa(Balance)))				//making a test var "abc", I find it handy to read/write to it right away to test the network
	//err = stub.PutState('defaultUser', []byte(strconv.Itoa(Balance)))				//making a test var "abc", I find it handy to read/write to it right away to test the network
	if err != nil {
		return nil, err
	}

	var empty []string
	jsonAsBytes, _ := json.Marshal(empty)		//marshal an emtpy array of strings to clear the index
	err = stub.PutState(contractIndexStr, jsonAsBytes)
	if err != nil {
		return nil, err
	}

	err = stub.PutState(locIndexStr, jsonAsBytes)
	if err != nil {
		return nil, err
	}

	err = stub.PutState(shipmentIndexStr, jsonAsBytes)
	if err != nil {
		return nil, err
	}
  err = stub.PutState(EVENT_COUNTER, []byte("1"))
	if err != nil {
		return nil, err
	}

	return nil, nil
}

func (t *SimpleChaincode) Invoke(stub shim.ChaincodeStubInterface, function string, args []string) ([]byte, error) {
	fmt.Println("invoke is running ", function)
	var err error

	// Handle different functions
	if function == "init" {													//initialize the chaincode state, used as reset
		t.Init(stub, "init", args)
	} else if function == "init_contract_terms" {				//create a business contract 
		t.init_terms(stub, args)
	} else if function == "create_loc" {
		t.create_letter_of_credit(stub, args)
	} else if function == "shipment_activity" {
		t.shipment_activity(stub, args)
	} else{
	/*else if function == "shipment_event" {				//Enter the shipment event within the supply chain route 
		return t.shipment_event(stub, args)
	} else if function == "transfer_funds" {		  //transfer funds from one participant to another
		res, err := t.transfer_funds(stub, args)
		//cleanTrades(stub)													//lets make sure all open trades are still valid
		return res, err
	}*/
		fmt.Println("invoke did not find func: " + function)					//error
	}
	//Event based
  b, err := stub.GetState(EVENT_COUNTER)
	if err != nil {
		return nil, errors.New("Failed to get state")
	}
	noevts, _ := strconv.Atoi(string(b))

	tosend := "Event Counter is " + string(b)

	err = stub.PutState(EVENT_COUNTER, []byte(strconv.Itoa(noevts+1)))
	if err != nil {
		return nil, err
	}

	err = stub.SetEvent("evtsender", []byte(tosend))
	if err != nil {
		return nil, err
  }

	return nil, nil 


}

// Transaction makes payment of X units from A to B
func (t *SimpleChaincode) init_terms(stub shim.ChaincodeStubInterface, args []string) ([]byte, error) {

	var err error

	fmt.Printf("init_terms(): Initializing a contract with args: %d\n", len(args))
	// 0								1							2
	// "contract_id" "product_type"	"max_temperature_f"
	if len(args) != 5 {
		return nil, errors.New("Incorrect number of arguments. Expecting 5")
	}

	//input sanitation
	if len(args[0]) <= 0 {
		return nil, errors.New("1st argument must be a non-empty string")
	}
	if len(args[1]) <= 0 {
		return nil, errors.New("2nd argument must be a non-empty string")
	}
	if len(args[2]) <= 0 {
		return nil, errors.New("3rd argument must be a number")
	}
	if len(args[3]) <= 0 {
		return nil, errors.New("4th argument must be a number")
	}
	if len(args[4]) <= 0 {
		return nil, errors.New("5th argument must be a number")
	}

	contract := ContractTerms{}

	fmt.Println("- This start init contract terms")
	// Get input args
	contract.ContractID				= args[0]				// Contract ID
	contract.Product_Type			= strings.ToLower(args[1])			// type of product being transferred  
	contract.Quantity_lbs,err	= strconv.Atoi(args[2])
	if err != nil {
		fmt.Println("Quantity must be integer!")
		return nil, errors.New("Quantity must be integer")
	}

	contract.Amount_dollars, err = strconv.Atoi(args[3])	// max temperature
	if err != nil {
		fmt.Println("Amount must be integer!")
		return nil, errors.New("Amount must be integer")
	}

	contract.Max_TemperatureC, err = strconv.Atoi(args[4])	// max temperature
	if err != nil {
		fmt.Println("Max Temperature must be integer!")
		return nil, errors.New("Max Temperature must be integer")
	}

	timestamp := makeTimestamp()
	contract.Timestamp = timestamp

	// Check if contract already exists
	contractAsBytes, err := stub.GetState(contract.ContractID)
	if err != nil {
		return nil, errors.New("Failed to get state")
	}

	var res ContractTerms
	json.Unmarshal(contractAsBytes, &res)
	if res.ContractID == contract.ContractID {
		retstr := "Terms of Contract for product " + res.ContractID + " already exists"
		return nil, errors.New(retstr)
	}

	//build the contract json string manually
	//str := `{"contract_ID": "` + contract_id + `", "product_type": "` + product_type + `", "max_temperature_f": "` + strconv.Itoa(max_temperature_f) + `", "creation_time": "` + timestamp + `"}`

	fmt.Printf("Creating new Contract %s\n", contract)
	//err = stub.PutState(contract_id, []byte(str))						//store contract with contract ID as key

	cjsonAsBytes, _ := json.Marshal(contract)
	err = stub.PutState(contract.ContractID, cjsonAsBytes)						//store contract with contract ID as key
	if err != nil {
		fmt.Printf("ERRORR!\n")
		return nil, err
	}

	//get the contracts index
	contractsAsBytes, err := stub.GetState(contractIndexStr)
	if err != nil {
		return nil, errors.New("Failed to get contract terms index")
	}
	var contractIndex []string
	json.Unmarshal(contractsAsBytes, &contractIndex)							//un stringify it aka JSON.parse()

	//append
	contractIndex = append(contractIndex, contract.ContractID)						//add the contract_id to index list
	fmt.Println("! contract index: ", contractIndex)
	jsonAsBytes, _ := json.Marshal(contractIndex)
	err = stub.PutState(contractIndexStr, jsonAsBytes)						//store name of marble in list

	fmt.Println("- end init contract terms\n")

	//Event based
  b, err := stub.GetState(EVENT_COUNTER)
	if err != nil {
		return nil, errors.New("Failed to get state")
	}
	noevts, _ := strconv.Atoi(string(b))

	tosend := "Event Counter is " + string(b)

	err = stub.PutState(EVENT_COUNTER, []byte(strconv.Itoa(noevts+1)))
	if err != nil {
		return nil, err
	}

	err = stub.SetEvent("evtsender", []byte(tosend))
	if err != nil {
		return nil, err
        }
	return nil, nil
}

// Create a Letter of Credit
func (t *SimpleChaincode) create_letter_of_credit(stub shim.ChaincodeStubInterface, args []string) ([]byte, error) {

	var err error
	// locID contractID value_dollars importer exporter shipper customs portOfLoading portOfEntry	
	if len(args) != 11 {
		return nil, errors.New("Incorrect number of arguments. Expecting 11")
	}

	fmt.Println("Create a Letter Of Credit")
	if len(args[0]) <= 0 {
		return nil, errors.New("1st argument must be a non-empty string")
	}
	if len(args[1]) <= 0 {
		return nil, errors.New("2nd argument must be a non-empty string")
	}
	if len(args[2]) <= 0 {
		return nil, errors.New("3th argument must be a non-empty string")
	}
	if len(args[3]) <= 0 {
		return nil, errors.New("4th argument must be a non-empty string")
	}
	if len(args[4]) <= 0 {
		return nil, errors.New("5th argument must be a non-empty string")
	}
	if len(args[5]) <= 0 {
		return nil, errors.New("6th argument must be a non-empty string")
	}
	if len(args[6]) <= 0 {
		return nil, errors.New("7th argument must be a non-empty string")
	}
	if len(args[7]) <= 0 {
		return nil, errors.New("8th argument must be a non-empty string")
	}
	if len(args[8]) <= 0 {
		return nil, errors.New("9th argument must be a non-empty string")
	}
	if len(args[9]) <= 0 {
		return nil, errors.New("10th argument must be a non-empty string")
	}
	if len(args[10]) <= 0 {
		return nil, errors.New("11th argument must be a non-empty string")
	}

	// Decode the json object

	loc := LetterOfCredit{}
	loc.LocID				= args[0]	
	loc.ContractID	= args[1]	
	loc.Value, err	= strconv.Atoi(args[2])
	if err != nil {
		fmt.Printf("ERROR Value must be an integer value")
		return nil, err
	}
	loc.Importer.Company		= args[3]
	loc.Importer.Bank				= args[4]
	loc.Exporter.Company		= args[5]
	loc.Exporter.Bank				= args[6]
	loc.ShippingCo	= args[7]
	loc.Customs			= args[8]
	loc.PortOfLoading		= args[9]
	loc.PortOfEntry			= args[10]
	loc.Timestamp				= makeTimestamp()

	// Check if loc already exists
	fmt.Println("Get state for: ", loc.LocID)
	locAsBytes,err := stub.GetState(loc.LocID)
	if err != nil {
		return nil, errors.New("Failed to get state")
	}

	var res LetterOfCredit 
	json.Unmarshal(locAsBytes, &res)
	if res.LocID == loc.LocID {
		retstr := "Terms of LOC for product " + res.LocID + " already exists"
		return nil, errors.New(retstr)
	}

	fmt.Printf("Requesting to create loc: %s\n", loc)

	// Check if contract exists for this LOC ID
	_,err = t.query_doc(stub, "contract", loc.ContractID)
	//contractAsBytes, err := stub.GetState(contract_id)
	if err != nil {
		fmt.Println("Failed to get state for Contract ", loc.ContractID)
		return nil, errors.New("Failed to get state for Contract "+ loc.ContractID)
	}

	fmt.Printf("Contract %s exists for LOC %s", loc.ContractID, loc.LocID)

	//build the loc json string manually
	//str := `{"locID": "` + locID + `", "contract_ID": "` + contract_id + `", "value_dollars": "` + strconv.Itoa(value) + `", "shipping_co": "` + shipper + `", "importer":"` + importer + `", "exporter": "` + exporter + `", "customs_auth": "` + customs + `", "port_of_loading": "` + portOfLoading + `", "port_of_entry": "` + portOfEntry + `", "creation_time": "` + strconv.FormatInt(timestamp, 10) + `"}`

	//fmt.Printf("Adding new LOC %s\n", str)
	//err = stub.PutState(locID, []byte(str))						//store contract with LOC ID as key
	fmt.Printf("Adding new LOC %s\n", loc)
	ljsonAsBytes, _ := json.Marshal(loc)
	err = stub.PutState(loc.LocID, ljsonAsBytes)						//store contract with LOC ID as key
	if err != nil {
		fmt.Printf("ERRORR!\n")
		return nil, err
	}

	//get the loc index
	locListAsBytes, err := stub.GetState(locIndexStr)
	if err != nil {
		return nil, errors.New("Failed to get LOC index")
	}
	var locIndex []string
	json.Unmarshal(locListAsBytes, &locIndex)							//un stringify it aka JSON.parse()

	//append to list
	locIndex = append(locIndex, loc.LocID)						//add the loc_id to index list
	fmt.Println("! loc index: ", locIndex)
	jsonAsBytes, _ := json.Marshal(locIndex)
	err = stub.PutState(locIndexStr, jsonAsBytes)		//store name of LOC in list

	tosend := "Added LOC: " + loc.LocID + " to blockchain"
	err = stub.SetEvent("evtsender", []byte(tosend))
	if err != nil {
		return nil, err
  }

	fmt.Println("- end create_loc\n")
	return nil, nil
}

// Enter a shipment activtiy 
func (t *SimpleChaincode) shipment_activity(stub shim.ChaincodeStubInterface, args []string) ([]byte, error) {

	// contractID	value_dollars	start_temp_c	shipping_co	location	shipEvent
	if len(args) !=  7 {
		return nil, errors.New("Incorrect number of arguments. Expecting 7")
	}

	fmt.Println("Add shipment activity")
	if len(args[0]) <= 0 {
		return nil, errors.New("1st argument must be a non-empty string")
	}
	if len(args[1]) <= 0 {
		return nil, errors.New("2nd argument must be a non-empty string")
	}
	if len(args[2]) <= 0 {
		return nil, errors.New("3nd argument must be a non-empty string")
	}
	if len(args[3]) <= 0 {
		return nil, errors.New("4nd argument must be a non-empty string")
	}
	if len(args[4]) <= 0 {
		return nil, errors.New("5nd argument must be a non-empty string")
	}
	if len(args[5]) <= 0 {
		return nil, errors.New("6nd argument must be a non-empty string")
	}
	if len(args[6]) <= 0 {
		return nil, errors.New("7nd argument must be a non-empty string")
	}

	var shipment Shipment
	var err error

	fmt.Println("shipment arg0: %s\n", args[0])
	shipment.ContractID = args[1]
	shipment.Value, err =  strconv.Atoi(args[2])
	shipment.Cargo_TempC, err=  strconv.Atoi(args[3])
	shipment.ShippingCo = args[4]
	shipment.Location = args[5]
	shipment.ShipEvent = args[6]
	shipment.Timestamp = makeTimestamp()
	//activity := []byte(args[0])
	//err = json.Unmarshal(activity, &shipment)
  if err != nil {
   fmt.Println("Error in reading JSON\n") 
  }
//	fmt.Printf("Shipment for contract ID: %s\n", shipment.ContractID)
	// Does contract ID exist
	// Get the state from the ledger
//	contractAsBytes, err := stub.GetState(shipment.ContractID)
//	if err != nil {
//		return nil, errors.New("Cannot created shipment activity. ContractID doesn't exist")
//	}
	// Check if loc already exists
//	fmt.Println("Get state for: ", shipment.shipmentID)
//	locAsBytes,err := stub.GetState(loc.LocID)
//	if err != nil {
//		return nil, errors.New("Failed to get state")
//	}


//	shipmentAsBytes, err := stub.GetState(shipmentIndexStr)
//	if err != nil {
//		return nil, errors.New("Failed to get shipement index")
//	}
//	var shipmenttIndex []string
//	json.Unmarshal(shipmentsAsBytes, &shipmentIndex)		//un stringify it aka JSON.parse()


//	if res.ContractID == contract_id {
//		retstr := "Terms of Contract for product " + res.ContractID + " already exists"
//		return nil, errors.New(retstr)
//	}


	return nil, nil

}

// Deletes an entity from state
func (t *SimpleChaincode) delete(stub shim.ChaincodeStubInterface, args []string) ([]byte, error) {
	if len(args) != 1 {
		return nil, errors.New("Incorrect number of arguments. Expecting 1")
	}

	A := args[0]

	// Delete the key from the state in ledger
	err := stub.DelState(A)
	if err != nil {
		return nil, errors.New("Failed to delete state")
	}

	return nil, nil
}

func (t *SimpleChaincode) query_doc(stub shim.ChaincodeStubInterface, doctype string, docID string) ([]byte, error) {

		fmt.Printf("looking for %s with ID: %s", doctype, docID)

		// Get the state from the ledger
    assetBytes, err:= stub.GetState(docID)
    if err != nil  || len(assetBytes) ==0{
        err = errors.New("Unable to get asset state from ledger")
        return nil, err
    }
    return assetBytes, nil
	}

// Query callback representing the query of a chaincode
func (t *SimpleChaincode) Query(stub shim.ChaincodeStubInterface, function string, args []string) ([]byte, error) {

	if (function != "query") {
		return nil, errors.New("Invalid query function name. Expecting \"query_contract_id\"")
	}

	if len(args) != 2 {
		return nil, errors.New("Incorrect number of arguments. Expecting 2 arguments")
	}

	var DocType string // Entities
	var DocID string // Entities
	var jsonResp string

	DocType = args[0] 
	DocID = args[1] 

	fmt.Printf("Query doctype: %s with ID: %s\n", DocType, DocID)

	fmt.Println("Calling query_doc()")
	Avalbytes, err := t.query_doc(stub, DocType, DocID)
	if err != nil {
		jsonResp := "{\"Error\":\"Failed to get state for doc " + DocType + " with ID: " + DocID + "\"}"
		return nil, errors.New(jsonResp)
	}

//	Avalbytes, err := stub.GetState(DocID)
//	if err != nil {
//		jsonResp := "{\"Error\":\"Failed to get state for doc " + DocType + " with ID: " + DocID + "\"}"
//		return nil, errors.New(jsonResp)
//	}

//	if Avalbytes == nil {
//		jsonResp := "{\"Error\":\"Nil amount for " + A + "\"}"
//		return nil, errors.New(jsonResp)
//	}

	fmt.Printf("Query response: %s\n", jsonResp)
//	jsonResp := "{\"Name\":\"" + A + "\",\"Amount\":\"" + string(Avalbytes) + "\"}"
//	fmt.Printf("Query Response:%s\n", jsonResp)
	return Avalbytes, nil
}

// ========================================================================================================    ====================
// Make Timestamp - create a timestamp in ms
// ========================================================================================================    ====================
func makeTimestamp() int64 {
    return time.Now().UnixNano() / (int64(time.Millisecond)/int64(time.Nanosecond))
}
